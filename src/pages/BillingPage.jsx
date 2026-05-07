import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useAuth from '../auth/useAuth';
import apiClient from '../api/apiClient';
import '../styles/BillingPage.css';

export default function BillingPage() {
  const { activeCenter } = useAuth();
  
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
    paymentMethod: 'CASH'
  });
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState('TODAY'); // 'TODAY', 'PAST', 'ALL'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'PAID', 'PENDING'
  const [isExportDrawerOpen, setIsExportDrawerOpen] = useState(false);
  const [exportMode, setExportMode] = useState('ALL'); // 'ALL', 'RANGE'
  const [exportDates, setExportDates] = useState({ start: '', end: '' });
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // --- SYNC & FETCH ---
  const [stats, setStats] = useState({ totalRevenue: 0, pendingCount: 0, realizationRate: 0, averageTicket: 0, pendingRevenue: 0 });
  const [matrix, setMatrix] = useState({ daily: [], monthly: [], yearly: [] });
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
    } catch (err) {
      console.error('[FINANCE] Invoice fetch failed', err);
    }
  }, [searchTerm, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/stats');
      setStats(res.data);
    } catch (err) {
      console.error('[FINANCE] Stats fetch failed', err);
    }
  }, []);

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/registry');
      setServiceRegistry(res.data);
    } catch (err) {
      console.error('[FINANCE] Registry fetch failed', err);
    }
  }, []);

  const fetchMatrix = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/matrix');
      setMatrix(res.data);
    } catch (err) {
      console.error('[FINANCE] Matrix fetch failed', err);
    }
  }, []);

  const fetchPendingBillables = useCallback(async (patientId) => {
    try {
      const res = await apiClient.get(`/finance/pending-billables/${patientId}`);
      setPendingServices(res.data);
    } catch (err) {
      console.error('[FINANCE] Pending billables fetch failed', err);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const res = await apiClient.get('/finance/expenses');
      setExpenses(res.data);
    } catch (err) {
      console.error('[FINANCE] Expenses fetch failed', err);
    }
  }, []);

  const fetchReferrers = useCallback(async () => {
    try {
      const res = await apiClient.get('/referrers');
      setReferrers(res.data);
    } catch (err) {
      console.error('[FINANCE] Referrers fetch failed', err);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchStats();
    fetchRegistry();
    fetchMatrix();
    fetchExpenses();
    fetchReferrers();
  }, [fetchInvoices, fetchStats, fetchRegistry, fetchMatrix, fetchExpenses, fetchReferrers]);

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    try {
      setSavingExpense(true);
      await apiClient.post('/finance/expense', editExpense);
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
      alert('PROTOCOL FAILURE: Failed to record operational expense.');
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to delete this operational expense?')) return;
    try {
      await apiClient.delete(`/finance/expenses/${id}`);
      fetchExpenses();
    } catch (err) {
      console.error('[FINANCE] Failed to delete expense', err);
      alert('PROTOCOL FAILURE: Could not delete expense.');
    }
  };

  const handleDeleteInvoice = async (id) => {
    if (!window.confirm('Are you sure you want to delete this invoice? This action is irreversible.')) return;
    try {
      await apiClient.delete(`/finance/invoices/${id}`);
      fetchInvoices();
      fetchStats();
    } catch (err) {
      console.error('[FINANCE] Failed to delete invoice', err);
      alert('PROTOCOL FAILURE: Could not delete invoice.');
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
    
    return invoices.filter(inv => {
      // Search Filter
      const matchesSearch = inv.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (inv.displayId && inv.displayId.toLowerCase().includes(searchTerm.toLowerCase()));
      
      if (!matchesSearch) return false;

      // Status Filter
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;

      // Time Filter
      const invDate = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-CA') : null;
      if (timeFilter === 'TODAY' && invDate !== today) return false;
      if (timeFilter === 'PAST' && invDate === today) return false;

      return true;
    });
  }, [invoices, searchTerm, timeFilter, statusFilter]);

  const liveStats = useMemo(() => {
    const paidInvoices = filteredInvoices.filter(inv => inv.status === 'PAID');
    const pendingInvoices = filteredInvoices.filter(inv => inv.status === 'PENDING');
    
    const totalRevenue = paidInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const pendingRevenue = pendingInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const pendingCount = pendingInvoices.length;
    
    const totalBilled = totalRevenue + pendingRevenue;
    const realizationRate = totalBilled > 0 ? Math.round((totalRevenue / totalBilled) * 100) : 0;
    const averageTicket = paidInvoices.length > 0 ? Math.round(totalRevenue / paidInvoices.length) : 0;

    return { totalRevenue, pendingRevenue, pendingCount, realizationRate, averageTicket };
  }, [filteredInvoices]);

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, timeFilter, statusFilter]);

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

  const handleUpdateItem = (index, field, value) => {
    const newItems = [...selectedInvoice.items];
    newItems[index] = { ...newItems[index], [field]: value };
    const newTotal = newItems.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
    setSelectedInvoice({ ...selectedInvoice, items: newItems, totalAmount: newTotal });
  };

  const handleAddItem = () => {
    const newItems = [...selectedInvoice.items, { description: '', amount: 0, quantity: 1 }];
    setSelectedInvoice({ ...selectedInvoice, items: newItems });
  };

  const handleRemoveItem = (index) => {
    const newItems = selectedInvoice.items.filter((_, i) => i !== index);
    const newTotal = newItems.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
    setSelectedInvoice({ ...selectedInvoice, items: newItems, totalAmount: newTotal });
  };

  const handleCollectPayment = async () => {
    try {
      await apiClient.post('/finance/payments', { 
        invoiceId: selectedInvoice.invoiceId, 
        amount: selectedInvoice.balanceAmount, // Pay the remaining balance
        paymentMethod 
      });
      setIsInvoiceDrawerOpen(false);
      fetchInvoices();
      fetchStats();
      alert(`PAYMENT SUCCESS: Received ₹${selectedInvoice.balanceAmount} via ${paymentMethod}`);
    } catch (err) {
      console.error('[FINANCE] Payment failed', err);
    }
  };

  const handleCreateManualInvoice = async (e) => {
    e.preventDefault();
    if (!selectedPatient || newInvoiceData.items.length === 0) {
      alert("PLEASE SELECT A REGISTERED PATIENT TO PROCEED");
      return;
    }
    
    try {
      await apiClient.post('/finance/invoices', {
        patientId: selectedPatient.patientId,
        appointmentId: null,
        items: newInvoiceData.items.map(it => ({
          description: it.description,
          amount: Number(it.amount),
          quantity: Number(it.quantity)
        }))
      });
      
      setIsNewInvoiceDrawerOpen(false);
      setSelectedPatient(null);
      setPatientSearchQuery('');
      setNewInvoiceData({ patientName: '', items: [{ description: '', amount: 0, quantity: 1 }], paymentMethod: 'CASH' });
      fetchInvoices();
      fetchStats();
      alert('INVOICE GENERATED: Financial record successfully added to ledger.');
    } catch (err) {
      console.error('[FINANCE] Invoice creation failed', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'SYSTEM FAILURE: Failed to deploy invoice metadata.';
      alert(errorMsg);
    }
  };

  const handleSaveInvoice = () => {
    const updated = invoices.map(inv => 
      inv.invoiceId === selectedInvoice.invoiceId ? selectedInvoice : inv
    );
    saveInvoices(updated);
    setIsInvoiceDrawerOpen(false);
  };

  // --- RENDERERS ---
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '25px', padding: '15px', borderTop: '1px solid #f1f5f9' }}>
        <button 
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          disabled={currentPage === 1}
          style={{ padding: '8px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: 900, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}
        >PREVIOUS</button>
        <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b' }}>
          PAGE <span style={{ color: '#0f52ba' }}>{currentPage}</span> OF <span style={{ color: '#0f52ba' }}>{totalPages}</span>
        </div>
        <button 
          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          disabled={currentPage === totalPages}
          style={{ padding: '8px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: 900, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e' }}>TOTAL PAYABLE QUANTUM</span>
                   <span style={{ fontSize: '24px', fontWeight: 950, color: '#0f52ba' }}>₹{selectedInvoice.totalAmount.toLocaleString()}</span>
                </div>
             </div>

             <div style={{ marginBottom: '30px', background: '#fff1f2', padding: '15px', borderRadius: '16px', border: '1px dashed #fecdd3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', marginBottom: '4px' }}>REFERRAL PAYOUT PROTOCOL</div>
                  <div style={{ fontSize: '12px', fontWeight: 950, color: '#881337' }}>
                    {selectedInvoice.referrerName ? selectedInvoice.referrerName.toUpperCase() : 'NO SYSTEM REFERRER LINKED'}
                  </div>
                  <div style={{ fontSize: '9px', color: '#e11d48', opacity: 0.7, marginTop: '4px' }}>
                     Log commission to deduct from net profit
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setBillingViewMode('EXPENSES');
                    setIsInvoiceDrawerOpen(false);
                    setEditExpense({ 
                      description: `Referral commission for ${selectedInvoice.patientName} (${selectedInvoice.displayId})`, 
                      category: 'Marketing', 
                      amount: 0, 
                      taxAmount: 0,
                      transactionDate: TODAY, 
                      paymentMode: 'Cash', 
                      referenceNumber: selectedInvoice.displayId,
                      vendorName: selectedInvoice.referrerName || '',
                      costCenter: 'Administration',
                      status: 'Paid'
                    }); 
                    setIsExpenseDrawerOpen(true);
                  }}
                  style={{ padding: '10px 18px', borderRadius: '10px', background: '#e11d48', color: 'white', border: 'none', fontSize: '10px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 4px 10px rgba(225, 29, 72, 0.2)' }}
                >
                  LOG CUT PAYMENT 💸
                </button>
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
               <div style={{ background: '#f0fdf4', border: '1px solid #bcf0da', padding: '20px', borderRadius: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', marginBottom: '10px' }}>✅</div>
                  <div style={{ fontSize: '12px', fontWeight: 950, color: '#166534' }}>TRANSACTION SETTLED</div>
                  <div style={{ fontSize: '10px', color: '#166534', opacity: 0.7, marginTop: '4px' }}>Processed on {new Date(selectedInvoice.createdAt).toLocaleString()}</div>
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
                      {referrers.map(r => <option key={`ref-${r.id}`} value={r.fullName} />)}
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
              </div>

              <button type="submit" disabled={!selectedPatient} style={{ width: '100%', padding: '18px', borderRadius: '16px', border: 'none', background: selectedPatient ? '#0f52ba' : '#cbd5e1', color: 'white', fontWeight: 950, cursor: selectedPatient ? 'pointer' : 'not-allowed', marginTop: '20px' }}>
                 AUTHORIZE & DEPLOY INVOICE
              </button>
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

      {billingViewMode === 'EXPENSES' ? (
        <div className="expenses-main" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>EXPENSE_PROTOCOL:</span>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                   {['ALL', 'REFERRAL CUTS'].map(f => (
                     <button 
                      key={f}
                      onClick={() => setExpenseFilter(f === 'ALL' ? 'ALL' : 'REFERRAL')}
                      style={{ 
                        padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: (f === 'ALL' && expenseFilter === 'ALL') || (f === 'REFERRAL CUTS' && expenseFilter === 'REFERRAL') ? '#dc2626' : 'transparent',
                        color: (f === 'ALL' && expenseFilter === 'ALL') || (f === 'REFERRAL CUTS' && expenseFilter === 'REFERRAL') ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s'
                      }}
                     >{f}</button>
                   ))}
                </div>
              </div>

              <button 
                onClick={() => { 
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
                  setIsExpenseDrawerOpen(true); 
                }}
                style={{ 
                  padding: '12px 24px', borderRadius: '12px', border: 'none', 
                  background: '#dc2626', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(220, 38, 38, 0.2)'
                }}
              >
                LOG OPERATIONAL EXPENSE 💸
              </button>
           </div>
           
           <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
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
                  {expenses.filter(exp => {
                    if (expenseFilter === 'REFERRAL') {
                      return exp.category === 'Marketing' || exp.description.toLowerCase().includes('referral');
                    }
                    return true;
                  }).map(exp => (
                    <tr key={exp.id} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                      <td style={{ padding: '20px 30px', fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{new Date(exp.transactionDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td style={{ padding: '20px 30px', fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{exp.description}</td>
                      <td style={{ padding: '20px 30px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: 'white', background: '#dc2626', padding: '5px 12px', borderRadius: '8px' }}>{exp.category}</span>
                      </td>
                      <td style={{ padding: '20px 30px', textAlign: 'right', fontSize: '14px', fontWeight: 950, color: '#dc2626' }}>₹{exp.amount.toLocaleString()}</td>
                      <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                        <button 
                          onClick={() => handleDeleteExpense(exp.id)}
                          style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}
                        >DELETE</button>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ padding: '50px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>No operational expenses found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
        </div>
      ) : (
      <>
      {/* Filter Matrix Controls */}
      <div className="filter-matrix" style={{ display: 'flex', gap: '30px', marginBottom: '30px', background: '#f1f5f9', padding: '15px 25px', borderRadius: '18px', border: '1px solid #e2e8f0', alignItems: 'center' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>TEMPORAL_FILTER:</span>
            <div style={{ display: 'flex', background: 'white', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
               {['TODAY', 'PAST', 'ALL'].map(t => (
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

         {/* Stats Summary Bubble */}
         <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>MATCHING_RECORDS:</span>
            <span style={{ background: '#0f52ba', color: 'white', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 950 }}>{filteredInvoices.length}</span>
         </div>
      </div>

      {/* KPI HUD */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '25px', marginBottom: '40px' }}>
        <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>TOTAL REVENUE (PAID)</p>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#1a1a2e' }}>₹{liveStats.totalRevenue.toLocaleString()}</div>
          <div style={{ marginTop: '10px', fontSize: '10px', color: '#2ecc71', fontWeight: 800 }}>MATCHING CURRENT PROTOCOL</div>
        </div>
        <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>PENDING UNPAID</p>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#f39c12' }}>₹{liveStats.pendingRevenue.toLocaleString()}</div>
          <div style={{ marginTop: '10px', fontSize: '10px', color: '#f39c12', fontWeight: 800 }}>{liveStats.pendingCount} INVOICES OUTSTANDING</div>
        </div>
        <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>COLLECTION EFFICIENCY</p>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#0f52ba' }}>{liveStats.realizationRate}%</div>
          <div style={{ marginTop: '10px', fontSize: '10px', color: '#0f52ba', fontWeight: 800 }}>BASED ON FILTERED SCOPE</div>
        </div>
        <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>AVG TICKET SIZE</p>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#1a1a2e' }}>₹{liveStats.averageTicket.toLocaleString()}</div>
          <div style={{ marginTop: '10px', fontSize: '10px', color: '#888', fontWeight: 600 }}>PAID INVOICES IN SCOPE</div>
        </div>
      </div>

      <div className="content-main" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
        {/* Ledger Section */}
        <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
           <h3 style={{ fontSize: '14px', fontWeight: 950, marginBottom: '25px', letterSpacing: '1px' }}>GLOBAL TRANSACTION LEDGER</h3>
           <table style={{ width: '100%', borderCollapse: 'collapse' }}>
             <thead>
               <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                 <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>INVOICE_ID</th>
                 <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PATIENT_ENTITY</th>
                 <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>TIMESTAMP</th>
                 <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>QUANTUM</th>
                 <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>REFERRAL_CUT</th>
                 <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>STATUS</th>
                 <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', textAlign: 'right' }}>ACTIONS</th>
               </tr>
             </thead>
             <tbody>
               {paginatedInvoices.map(inv => (
                 <tr key={inv.invoiceId} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                   <td style={{ padding: '20px 10px', fontSize: '12px', fontWeight: 900, color: '#0f52ba', fontFamily: 'monospace' }}>{inv.displayId}</td>
                   <td style={{ padding: '20px 10px', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>{inv.patientName.toUpperCase()}</td>
                   <td style={{ padding: '20px 10px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{new Date(inv.createdAt).toLocaleString()}</td>
                   <td style={{ padding: '20px 10px', fontSize: '14px', fontWeight: 950, color: '#1a1a2e' }}>₹{inv.totalAmount.toLocaleString()}</td>
                   <td style={{ padding: '20px 10px' }}>
                       {inv.commissionAmount > 0 ? (
                         <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '13px', fontWeight: 950, color: '#e11d48' }}>₹{inv.commissionAmount.toLocaleString()}</span>
                            <span style={{ fontSize: '8px', fontWeight: 800, color: '#e11d48', opacity: 0.7 }}>LOGGED_PAYOUT</span>
                         </div>
                       ) : (
                         <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 700 }}>—</span>
                       )}
                   </td>
                   <td style={{ padding: '20px 10px' }}>
                      <span style={{ 
                        padding: '6px 12px', borderRadius: '8px', fontSize: '9px', fontWeight: 950,
                        background: inv.status === 'PAID' ? '#ecfdf5' : '#fff7ed',
                        color: inv.status === 'PAID' ? '#059669' : '#ea580c'
                      }}>
                        {inv.status}
                      </span>
                   </td>
                   <td style={{ padding: '20px 10px', textAlign: 'right', display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button 
                        onClick={() => {
                          setBillingViewMode('EXPENSES');
                          setEditExpense({ 
                            description: `Referral commission for ${inv.patientName} (${inv.displayId})`, 
                            category: 'Marketing', 
                            amount: 0, 
                            taxAmount: 0,
                            transactionDate: TODAY, 
                            paymentMode: 'Cash', 
                            referenceNumber: inv.displayId,
                            vendorName: inv.referrerName || '',
                            costCenter: 'Administration',
                            status: 'Paid'
                          }); 
                          setIsExpenseDrawerOpen(true);
                        }}
                        style={{ padding: '8px 12px', borderRadius: '10px', border: 'none', background: '#fff1f2', color: '#e11d48', fontSize: '10px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 2px 5px rgba(225,29,72,0.1)' }}
                      >LOG CUT 💸</button>
                      <button 
                        onClick={() => { setSelectedInvoice(inv); setIsInvoiceDrawerOpen(true); }}
                        style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}
                      >VIEW_DETAILS</button>
                      <button 
                        onClick={() => handleDeleteInvoice(inv.invoiceId)}
                        style={{ padding: '8px 12px', borderRadius: '10px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}
                      >DELETE</button>
                   </td>
                 </tr>
               ))}
               {filteredInvoices.length === 0 && (
                 <tr>
                   <td colSpan="6" style={{ padding: '80px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO TRANSACTIONS DETECTED IN ACTIVE LEDGER</td>
                 </tr>
               )}
             </tbody>
           </table>
           {renderPagination()}
        </div>

        {/* TEMPORAL MATRIX SECTION */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '30px' }}>
            <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 950, marginBottom: '20px', color: '#64748b', letterSpacing: '1px' }}>MONTHLY_PERFORMANCE_MATRIX</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                            <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>MONTH</th>
                            <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>INVOICED</th>
                            <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>COLLECTED</th>
                            <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>RATE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.monthly.map((m, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '12px 5px', fontSize: '11px', fontWeight: 900, color: '#1e293b' }}>{m.label}</td>
                                <td style={{ padding: '12px 5px', fontSize: '11px', fontWeight: 800 }}>₹{m.invoiced.toLocaleString()}</td>
                                <td style={{ padding: '12px 5px', fontSize: '11px', fontWeight: 800, color: '#059669' }}>₹{m.collected.toLocaleString()}</td>
                                <td style={{ padding: '12px 5px', fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>{m.realizationRate}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 950, marginBottom: '20px', color: '#64748b', letterSpacing: '1px' }}>DAILY_REVENUE_TREND (LATEST)</h3>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                                <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>DATE</th>
                                <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>INVOICED</th>
                                <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>COLLECTED</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matrix.daily.map((d, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                    <td style={{ padding: '12px 5px', fontSize: '11px', fontWeight: 900, color: '#64748b' }}>{d.label}</td>
                                    <td style={{ padding: '12px 5px', fontSize: '11px', fontWeight: 800 }}>₹{d.invoiced.toLocaleString()}</td>
                                    <td style={{ padding: '12px 5px', fontSize: '11px', fontWeight: 800, color: '#059669' }}>₹{d.collected.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>
      </>
      )}

      {isInvoiceDrawerOpen && renderInvoiceDrawer()}
      {isNewInvoiceDrawerOpen && renderNewInvoiceDrawer()}
      {isExportDrawerOpen && renderExportDrawer()}
      {isExpenseDrawerOpen && renderExpenseDrawer()}
    </div>
  );
}
