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
import FinanceManager from '../components/FinanceManager';

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
  const [billingViewMode, setBillingViewMode] = useState('INVOICES'); // 'INVOICES', 'EXPENSES', 'FINANCE'
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
    centreDiscount: 0,
    referrerDiscount: 0,
    paymentMethod: 'CASH',
    referrerId: ''
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
  const [referrerFilter, setReferrerFilter] = useState('ALL'); // 'ALL' or referrerId
  const [appointments, setAppointments] = useState([]);

  // FinanceManager Specific State
  const [billingSettings, setBillingSettings] = useState({ autoBill: true, currency: '₹' });
  const [isPriceDrawerOpen, setIsPriceDrawerOpen] = useState(false);
  const [editPrice, setEditPrice] = useState({ modality: '', serviceName: '', amount: 0, referralCutType: 'PERCENTAGE', referralCutValue: 0, referralCutInput: 0 });


  
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

  const [ownerDetails, setOwnerDetails] = useState(null);

  const fetchPersonnel = useCallback(async () => {
    try {
      const res = await apiClient.get('/personnel');
      const staffList = res.data || [];
      let owner = staffList.find(u => {
        const roles = (u.roles || u.Roles || []).map(r => r.toLowerCase());
        return roles.includes('admindoctor');
      });
      if (!owner) {
        owner = staffList.find(u => {
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
    } catch (err) {
      console.error('[FINANCE] Personnel fetch failed', err);
    }
  }, []);

  const refreshAllFinancialData = useCallback(() => {
    fetchInvoices();
    fetchStats();
    fetchRegistry();
    fetchMatrix();
    fetchExpenses();
    fetchReferrers();
    fetchCommissions();
    fetchAppointments();
    fetchPersonnel();
    fetchPersonnel();
  }, [fetchInvoices, fetchStats, fetchRegistry, fetchMatrix, fetchExpenses, fetchReferrers, fetchCommissions, fetchAppointments, fetchPersonnel]);

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
      alert('Offline: Expense will sync when reconnected.');
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
      refreshAllFinancialData(); // Refresh all financial hubs
    } catch (err) {
      console.error('[FINANCE] Expense save failed', err);
      if (!err.response) {
        await addToOutbox('EXPENSE', payload);
        alert('No connection: expense added to offline queue.');
        setIsExpenseDrawerOpen(false);
      } else {
        alert('Error: Failed to save expense.');
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
      alert('Error: Failed to save service price.');
    }
  };

  const handleDeletePrice = async (id) => {
    if (!window.confirm('Delete this service price?')) return;
    try {
      await apiClient.delete(`/finance/registry/${id}`);
      fetchRegistry();
    } catch (err) {
      console.error('[FINANCE] Price deletion failed', err);
      alert('Error: Could not delete service price.');
    }
  };

  const handleToggleAutoBill = () => {
    setBillingSettings(prev => ({ ...prev, autoBill: !prev.autoBill }));
  };
  
  const handlePrintThermal = (invInput = null) => {
    const inv = invInput || selectedInvoice;
    if (!inv) return;

    const itemsHtml = (inv.items || []).map(it => `
      <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; font-family: monospace;">
        <span>${it.description.substring(0, 20)} x${it.quantity}</span>
        <span>₹${((it.amount || 0) * (it.quantity || 0)).toLocaleString()}</span>
      </div>
    `).join('');

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
          ${itemsHtml}
          <div class="divider"></div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
            <span>TOTAL</span>
            <span>₹${(inv.totalAmount || 0).toLocaleString()}</span>
          </div>
          <div class="divider"></div>
          <div class="center" style="margin-top: 15px; font-size: 10px; font-weight: bold;">
            THANK YOU FOR CHOOSING 1RAD<br/>
            DIGITAL REPORT AT 1RAD.HEALTH
          </div>
          <div class="center" style="font-size: 8px; color: #555; margin-top: 15px; font-weight: bold; font-family: monospace; letter-spacing: 1px;">POWERED BY NEXEAGLE</div>
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
      alert(`Error: ${errorMsg}`);
    }
  };

  const handleSavePayout = async (e) => {
    e.preventDefault();
    if (!editPayout.referrerId) {
      alert("Please select a referrer before saving.");
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
      alert('Offline: Payout will sync when reconnected.');
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
        refreshAllFinancialData();
        alert(editPayout.commissionId ? 'Payout updated successfully.' : 'Commission recorded successfully.');
      }
    } catch (err) {
      console.error('[PAYOUT] Transaction failure:', err);
      if (!err.response) {
        await addToOutbox('PAYOUT', payload);
        alert('No connection: payout added to offline queue.');
        setIsPayoutDrawerOpen(false);
      } else {
        alert('Error: Could not save payout.');
      }
    } finally {
      setIsSavingPayout(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    
    if (!isOnline) {
      await addToOutbox('EXPENSE_DELETE', { id });
      alert('Offline: Deletion will sync when reconnected.');
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
        alert('No connection: deletion queued.');
        setExpenses(prev => prev.filter(e => e.id !== id));
      } else {
        alert('Error: Could not delete expense.');
      }
    }
  };

  const handleToggleCommissionStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'PAID' ? 'UNPAID' : 'PAID';
    try {
      await apiClient.patch(`/referrers/commissions/${id}/status`, `"${newStatus}"`, {
        headers: { 'Content-Type': 'application/json' }
      });
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Commission transition failed', err);
      alert('Error: Could not update commission status.');
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
      refreshAllFinancialData();
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
      refreshAllFinancialData();
      alert('Sync complete: local records merged.');
    } catch (err) {
      console.error('[FINANCE] Sync failed', err);
      alert('Sync failed. Please try again.');
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
      alert('Export failed. Please try again.');
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
    const totalPaid = safeInvoices.reduce((sum, inv) => sum + (Number(inv?.paidAmount) || 0), 0);
    const realizationRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
    const averageTicket = paidInvoices.length > 0 ? Math.round(totalPaid / paidInvoices.length) : 0;

    const totalGross = totalRevenue;
    const totalDiscount = safeInvoices.reduce((sum, inv) => sum + (Number(inv?.discountAmount) || 0), 0);
    const totalCommission = safeInvoices.reduce((sum, inv) => sum + (Number(inv?.commissionAmount) || 0), 0);
    const netProfit = totalBilled - totalCommission;

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
        modality: c.modality || 'MRI',
        patientName: c.patientName || 'N/A'
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
        type: 'OPERATIONAL',
        status: e.status?.toUpperCase() || 'PAID'
    }));
    
    const referralCuts = combinedReferralCuts.map(c => ({
        id: c.id,
        date: c.date,
        name: c.name,
        description: c.description,
        category: 'Referral',
        amount: c.amount,
        type: c.type,
        status: c.status,
        modality: c.modality
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

        // Partner (Referrer) Filter
        if (referrerFilter !== 'ALL') {
            if (cut.referrerId !== referrerFilter) return false;
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
  }, [combinedReferralCuts, timeFilter, startDate, endDate, modalityFilter, referrerFilter, sortConfig]);


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

  const handleCollectPayment = async (centreDiscount = 0, referrerDiscount = 0, deduction = 0, netAmount = 0) => {
    try {
      const payload = {
        invoiceId: selectedInvoice.invoiceId,
        amount: netAmount || selectedInvoice.totalAmount,
        centreDiscount,
        referrerDiscount,
        deduction,
        paymentMethod: paymentMethod
      };
      
      console.log('[FINANCE] Committing settlement:', payload);



      
      if (!isOnline) {
        await addToOutbox('PAYMENT', payload);
        alert('Offline: Payment will sync when reconnected.');
        setIsInvoiceDrawerOpen(false);
        return;
      }

      await apiClient.post('/finance/payments', payload);
      setIsInvoiceDrawerOpen(false);
      refreshAllFinancialData();
      alert(`Payment of ₹${selectedInvoice.balanceAmount} via ${paymentMethod} recorded.`);
    } catch (err) {
      console.error('[FINANCE] Payment failed', err);
      // Optional: Add to outbox if it was a network error
      if (!err.response) {
         await addToOutbox('PAYMENT', payload);
         alert('No connection: payment queued.');
         setIsInvoiceDrawerOpen(false);
      }
    }
  };

  const handleCreateManualInvoice = async (e) => {
    e.preventDefault();
    if (!selectedPatient || newInvoiceData.items.length === 0) {
      alert("Please select a patient to continue.");
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
        quantity: Number(it.quantity)
      }))
    };

    try {
      if (!isOnline) {
        await addToOutbox('INVOICE', payload);
        setIsNewInvoiceDrawerOpen(false);
        setNewInvoiceData({ patientName: '', items: [{ description: '', amount: 0, quantity: 1 }], centreDiscount: 0, referrerDiscount: 0, paymentMethod: 'CASH', referrerId: '' });
        alert('Offline: Invoice will sync when reconnected.');
        return;
      }

      await apiClient.post('/finance/invoices', payload);
      setIsNewInvoiceDrawerOpen(false);
      setSelectedPatient(null);
      setPatientSearchQuery('');
      setNewInvoiceData({ patientName: '', items: [{ description: '', amount: 0, quantity: 1 }], centreDiscount: 0, referrerDiscount: 0, paymentMethod: 'CASH', referrerId: '' });
      refreshAllFinancialData();
      alert('Invoice created successfully.');
    } catch (err) {
      console.error('[FINANCE] Invoice creation failed', err);
      if (!err.response) {
         await addToOutbox('INVOICE', payload);
         alert('No connection: invoice queued.');
         setIsNewInvoiceDrawerOpen(false);
      } else {
         const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to create invoice.';
         alert(errorMsg);
      }
    }
  };

  const handleSaveInvoice = async () => {
    try {
      await apiClient.post(`/finance/invoices/${selectedInvoice.invoiceId}/discount`, {
        discountAmount: selectedInvoice.discountAmount
      });
      refreshAllFinancialData();
      setIsInvoiceDrawerOpen(false);
      alert('Invoice updated successfully.');
    } catch (err) {
      console.error('[FINANCE] Discount application failed', err);
      alert('Error: Could not update invoice.');
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
      alert(`Adjustment of ₹${amount} applied.`);
    } catch (err) {
      console.error('[FINANCE] Adjustment failed', err);
      alert('Error: ' + (err.response?.data?.message || 'Could not apply adjustment.'));
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
        alert('Please allow popups to print on mobile devices.');
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
    
    const itemsHtml = (inv.items || []).map(it => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 14px 0; font-size: 11px; font-weight: 600; color: #1e293b;">${it.description.toUpperCase()}</td>
        <td style="padding: 14px 0; text-align: center; font-size: 11px; font-weight: 500; color: #64748b;">${it.quantity}</td>
        <td style="padding: 14px 0; text-align: right; font-size: 11px; font-weight: 500; color: #64748b;">₹${(it.amount || 0).toLocaleString()}</td>
        <td style="padding: 14px 0; text-align: right; font-size: 11px; font-weight: 700; color: #0f52ba;">₹${((it.amount || 0) * (it.quantity || 0)).toLocaleString()}</td>
      </tr>
    `).join('');

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
                  <span class="meta-label">Modality:</span><span class="meta-value">${inv.modality || 'MRI'}</span>
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
                  <th style="width: 50%;">Service Description</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Unit Price</th>
                  <th style="text-align: right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="summary-section">
              <div class="summary-table">
                <div class="summary-row">
                  <span class="summary-label">Gross Aggregate</span>
                  <span class="summary-value">₹${(inv.grossAmount || 0).toLocaleString()}</span>
                </div>
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
            <div style="text-align: center; font-size: 9px; color: #94a3b8; margin-top: 40px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Powered by Nexeagle</div>
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
                <span class="label">Payment Instrument:</span>
                <span class="value">${inv.paymentMethod || 'CASH'} / ID: ${inv.invoiceId.substring(0, 8).toUpperCase()}</span>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
           <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                placeholder="Search invoices or patients..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ 
                  padding: '12px 15px 12px 42px', 
                  borderRadius: '12px', 
                  border: '1px solid #e2e8f0', 
                  width: isMobile ? '100%' : '280px', 
                  fontSize: '11px', 
                  fontWeight: 800 
                }}
              />
           </div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px' }}>
             <button
               onClick={() => setIsExportDrawerOpen(true)}
               style={{
                 padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0',
                 background: '#10b981', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                 boxShadow: '0 4px 12px rgba(16,185,129,0.2)',
                 width: isMobile ? '100%' : 'auto'
               }}
             >
               Export
             </button>
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
             <button
               onClick={() => setIsNewInvoiceDrawerOpen(true)}
               style={{
                 padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#1d4ed8', color: 'white',
                 fontWeight: 600, fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(29,78,216,0.2)',
                 width: isMobile ? '100%' : 'auto'
               }}
             >
               + New Invoice
             </button>
          </div>
        </div>
      </div>

      {billingViewMode === 'EXPENSES' && (
        <ExpenseLedger 
          isMobile={isMobile}
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
          handleToggleExpenseStatus={handleToggleExpenseStatus}
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
          isMobile={isMobile}
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
          invoices={invoices}
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
          handlePrintA4={handlePrintA4}
          handlePrintThermal={handlePrintThermal}
          onApplyAdjustment={handleApplyAdjustment}
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
    </div>
  );
}
