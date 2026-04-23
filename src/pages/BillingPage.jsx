import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useAuth from '../auth/useAuth';
import apiClient from '../api/apiClient';
import '../styles/BillingPage.css';

export default function BillingPage() {
  const { activeCenter } = useAuth();
  
  // --- STATE ---
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isInvoiceDrawerOpen, setIsInvoiceDrawerOpen] = useState(false);
  const [isNewInvoiceDrawerOpen, setIsNewInvoiceDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('LEDGER'); // 'LEDGER', 'EXPENSES', 'ANALYTICS'
  const [viewMode, setViewMode] = useState('TABLE');
  const [expenses, setExpenses] = useState([]);
  const [isExpenseDrawerOpen, setIsExpenseDrawerOpen] = useState(false);
  
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

  // --- SYNC & FETCH ---
  const [stats, setStats] = useState({ totalRevenue: 0, pendingCount: 0, realizationRate: 0, averageTicket: 0, pendingRevenue: 0 });
  const [matrix, setMatrix] = useState({ daily: [], monthly: [], yearly: [] });
  const [isSyncing, setIsSyncing] = useState(false);

  // Responsive layout detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1100);
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
      console.error('[FINANCE] Expense fetch failed', err);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchStats();
    fetchRegistry();
    fetchMatrix();
  }, [fetchInvoices, fetchStats, fetchRegistry, fetchMatrix]);

  useEffect(() => {
    if (activeTab === 'EXPENSES') fetchExpenses();
  }, [activeTab, fetchExpenses]);

  // Handle window resize for responsive layout
  useEffect(() => {
    const handleResize = () => {
      const newWidth = window.innerWidth;
      setWindowWidth(newWidth);
      const tablet = newWidth < 1100;
      setIsMobile(tablet);
      if (tablet) setViewMode('CARDS');
      else setViewMode('TABLE');
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSyncLegacyData = async () => {
    const legacy = JSON.parse(localStorage.getItem('1rad_invoices') || '[]');
    if (legacy.length === 0) return alert('No legacy data detected in browser.');
    
    setIsSyncing(true);
    try {
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
    const today = new Date().toISOString().split('T')[0];
    
    return invoices.filter(inv => {
      const matchesSearch = inv.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            inv.invoiceId.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
      const invDate = new Date(inv.createdAt).toISOString().split('T')[0];
      if (timeFilter === 'TODAY' && invDate !== today) return false;
      if (timeFilter === 'PAST' && invDate === today) return false;
      return true;
    });
  }, [invoices, searchTerm, timeFilter, statusFilter]);

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
        amount: selectedInvoice.totalAmount, 
        paymentMethod 
      });
      setIsInvoiceDrawerOpen(false);
      fetchInvoices();
      fetchStats();
      alert(`PAYMENT SUCCESS: Received ₹${selectedInvoice.totalAmount} via ${paymentMethod}`);
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
      alert(err.response?.data?.error || 'SYSTEM FAILURE: Failed to deploy invoice metadata.');
    }
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
                   <div style={{ fontSize: '24px', fontWeight: 950, letterSpacing: '-1px' }}>{selectedInvoice.invoiceId}</div>
                </div>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                   <div style={{ padding: '8px 15px', background: 'rgba(255,255,255,0.2)', borderRadius: '10px', fontSize: '10px', fontWeight: 950 }}>
                      {selectedInvoice.status}
                   </div>
                   <button onClick={() => setIsInvoiceDrawerOpen(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', opacity: 0.7 }}>✕</button>
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
                        <input disabled={isPaid} type="text" value={item.description} onChange={e => handleUpdateItem(idx, 'description', e.target.value)} style={{ flex: 2, background: 'transparent', border: 'none', borderBottom: isPaid ? 'none' : '1px solid #ddd', fontSize: '12px', fontWeight: 700 }} />
                        <input disabled={isPaid} type="number" value={item.amount} onChange={e => handleUpdateItem(idx, 'amount', parseInt(e.target.value) || 0)} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: isPaid ? 'none' : '1px solid #ddd', fontSize: '12px', fontWeight: 950, textAlign: 'right' }} />
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

             {!isPaid ? (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', gap: '15px' }}>
                     <button onClick={() => setIsInvoiceDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontWeight: 800, cursor: 'pointer' }}>SAVE CHANGES</button>
                     <button onClick={handleCollectPayment} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 950, cursor: 'pointer' }}>PROCESS PAYMENT & CLOSE</button>
                  </div>
               </div>
             ) : (
               <div style={{ background: '#f0fdf4', border: '1px solid #bcf0da', padding: '20px', borderRadius: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', marginBottom: '10px' }}>✅</div>
                  <div style={{ fontSize: '12px', fontWeight: 950, color: '#166534' }}>TRANSACTION SETTLED</div>
               </div>
             )}
          </div>
        </div>
      </div>
    );
  };

  const renderNewInvoiceDrawer = () => (
    <div className="drawer-overlay" onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ padding: 0, width: '550px', background: 'white' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '35px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                 <h2 style={{ fontSize: '11px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Manual Revenue Input</h2>
                 <div style={{ fontSize: '24px', fontWeight: 950, letterSpacing: '-1px' }}>GENERATE NEW INVOICE</div>
              </div>
              <button onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}>✕</button>
           </div>
        </div>
        <div style={{ padding: '35px' }}>
           <form onSubmit={handleCreateManualInvoice}>
              <div style={{ marginBottom: '30px' }}>
                 <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '10px' }}>SEARCH_PATIENT_REGISTRY</label>
                 {!selectedPatient ? (
                   <input 
                     type="text" value={patientSearchQuery} placeholder="SEARCH BY NAME / UHID / CONTACT..." 
                     onChange={e => setPatientSearchQuery(e.target.value)}
                     style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700 }}
                   />
                 ) : (
                   <div style={{ background: '#f0f4ff', padding: '15px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 950 }}>{selectedPatient.fullName.toUpperCase()}</div>
                        <div style={{ fontSize: '10px' }}>UHID: {selectedPatient.patientIdentifier}</div>
                      </div>
                      <button type="button" onClick={() => setSelectedPatient(null)} style={{ border: 'none', background: 'none', color: '#0f52ba', fontSize: '10px', fontWeight: 950 }}>CHANGE</button>
                   </div>
                 )}
                 {patientResults.length > 0 && (
                   <div style={{ background: 'white', border: '1px solid #eee', borderRadius: '10px', marginTop: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                     {patientResults.map(p => (
                       <div key={p.patientId} onClick={() => { setSelectedPatient(p); setPatientResults([]); fetchPendingBillables(p.patientId); }} style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid #f9f9f9' }}>
                         {p.fullName.toUpperCase()} - {p.patientIdentifier}
                       </div>
                     ))}
                   </div>
                 )}
              </div>
              <button type="submit" disabled={!selectedPatient} style={{ width: '100%', padding: '18px', borderRadius: '16px', border: 'none', background: selectedPatient ? '#0f52ba' : '#cbd5e1', color: 'white', fontWeight: 950, cursor: 'pointer' }}>
                 AUTHORIZE & DEPLOY INVOICE
              </button>
           </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="billing-page" style={{ padding: isMobile ? '15px' : '40px', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-1px' }}>FINANCIAL REVENUE HUB</h1>
        <div style={{ display: 'flex', gap: '15px' }}>
           <button onClick={() => setIsExportDrawerOpen(true)} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', background: '#10b981', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>EXPORT DATA</button>
           <button onClick={() => setIsNewInvoiceDrawerOpen(true)} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '11px', cursor: 'pointer' }}>NEW INVOICE</button>
        </div>
      </div>

      {/* KPI HUD */}
      <div className="kpi-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', 
        gap: '20px', 
        marginBottom: '30px' 
      }}>
        <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #0f52ba, #1e3a8a)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', color: 'white', boxShadow: '0 10px 30px rgba(15, 82, 186, 0.2)' }}>
          <p style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.6)', letterSpacing: '1px', marginBottom: '10px' }}>TOTAL_REVENUE (PAID)</p>
          <div style={{ fontSize: '24px', fontWeight: 950 }}>₹{(stats.totalRevenue).toLocaleString()}</div>
        </div>
        <div className="kpi-card" style={{ background: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '10px' }}>PENDING_COLLECTION</p>
          <div style={{ fontSize: '24px', fontWeight: 950, color: '#f59e0b' }}>₹{stats.pendingRevenue.toLocaleString()}</div>
        </div>
        <div className="kpi-card" style={{ background: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '10px' }}>EFFICIENCY_RATE</p>
          <div style={{ fontSize: '24px', fontWeight: 950, color: '#0f52ba' }}>{stats.realizationRate}%</div>
        </div>
        <div className="kpi-card" style={{ background: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '10px' }}>AVG_TICKET_SIZE</p>
          <div style={{ fontSize: '24px', fontWeight: 950, color: '#1e293b' }}>₹{stats.averageTicket.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', background: 'white', padding: '10px', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
         {['LEDGER', 'EXPENSES', 'ANALYTICS'].map(tab => (
           <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: activeTab === tab ? '#0f52ba' : 'transparent', color: activeTab === tab ? 'white' : '#64748b', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>{tab}</button>
         ))}
      </div>

      <div className="content-main" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
        {activeTab === 'LEDGER' && (
          <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: isMobile ? '15px' : '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 950, letterSpacing: '1px' }}>GLOBAL TRANSACTION LEDGER</h3>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px' }}>
                  <button onClick={() => setViewMode('TABLE')} style={{ padding: '6px 12px', border: 'none', background: viewMode === 'TABLE' ? 'white' : 'transparent', borderRadius: '8px', fontSize: '10px', fontWeight: 900, cursor: 'pointer' }}>TABLE</button>
                  <button onClick={() => setViewMode('CARDS')} style={{ padding: '6px 12px', border: 'none', background: viewMode === 'CARDS' ? 'white' : 'transparent', borderRadius: '8px', fontSize: '10px', fontWeight: 900, cursor: 'pointer' }}>CARDS</button>
                </div>
             </div>
             {viewMode === 'TABLE' ? (
               <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                 <thead>
                   <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>ID</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>PATIENT</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>AMOUNT</th>
                     <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>STATUS</th>
                     <th style={{ padding: '15px 10px', textAlign: 'right' }}>ACTIONS</th>
                   </tr>
                 </thead>
                 <tbody>
                   {filteredInvoices.map(inv => (
                     <tr key={inv.invoiceId} style={{ borderBottom: '1px solid #f8fafc' }}>
                       <td style={{ padding: '20px 10px', fontSize: '12px', fontWeight: 900, color: '#0f52ba' }}>{inv.invoiceId}</td>
                       <td style={{ padding: '20px 10px', fontSize: '13px', fontWeight: 800 }}>{inv.patientName.toUpperCase()}</td>
                       <td style={{ padding: '20px 10px', fontSize: '14px', fontWeight: 950 }}>₹{inv.totalAmount.toLocaleString()}</td>
                       <td style={{ padding: '20px 10px' }}>
                          <span style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '9px', fontWeight: 950, background: inv.status === 'PAID' ? '#ecfdf5' : '#fff7ed', color: inv.status === 'PAID' ? '#059669' : '#ea580c' }}>{inv.status}</span>
                       </td>
                       <td style={{ padding: '20px 10px', textAlign: 'right' }}><button onClick={() => handleOpenInvoice(inv)} style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>VIEW</button></td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             ) : (
               <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                  {filteredInvoices.map(inv => (
                    <div key={inv.invoiceId} style={{ background: '#f8fafc', padding: '20px', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba' }}>{inv.invoiceId}</span>
                          <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 950, background: inv.status === 'PAID' ? '#ecfdf5' : '#fff7ed', color: inv.status === 'PAID' ? '#059669' : '#ea580c' }}>{inv.status}</span>
                       </div>
                       <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '5px' }}>{inv.patientName.toUpperCase()}</div>
                       <div style={{ fontSize: '18px', fontWeight: 950, marginBottom: '15px' }}>₹{inv.totalAmount.toLocaleString()}</div>
                       <button onClick={() => handleOpenInvoice(inv)} style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', color: '#0f52ba', fontSize: '10px', fontWeight: 950 }}>VIEW DETAILS</button>
                    </div>
                  ))}
               </div>
             )}
          </div>
        )}

        {activeTab === 'EXPENSES' && (
          <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: isMobile ? '15px' : '30px' }}>
             <h3 style={{ fontSize: '14px', fontWeight: 950, marginBottom: '25px' }}>INSTITUTIONAL EXPENSE LEDGER</h3>
             <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                   <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                         <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>DATE</th>
                         <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>CATEGORY</th>
                         <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>DESCRIPTION</th>
                         <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>AMOUNT</th>
                         <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>STATUS</th>
                      </tr>
                   </thead>
                   <tbody>
                      {expenses.map(exp => (
                        <tr key={exp.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                           <td style={{ padding: '20px 10px', fontSize: '12px' }}>{new Date(exp.date).toLocaleDateString()}</td>
                           <td style={{ padding: '20px 10px' }}><span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 900, background: '#f1f5f9' }}>{exp.category.toUpperCase()}</span></td>
                           <td style={{ padding: '20px 10px', fontSize: '13px' }}>{exp.description}</td>
                           <td style={{ padding: '20px 10px', fontSize: '14px', fontWeight: 950, color: '#dc2626' }}>₹{exp.amount.toLocaleString()}</td>
                           <td style={{ padding: '20px 10px' }}><span style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '9px', fontWeight: 950, background: exp.status === 'Paid' ? '#ecfdf5' : '#fef2f2', color: exp.status === 'Paid' ? '#059669' : '#dc2626' }}>{exp.status.toUpperCase()}</span></td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        )}

        {activeTab === 'ANALYTICS' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '30px' }}>
             <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '30px' }}>
                 <h3 style={{ fontSize: '12px', fontWeight: 950, marginBottom: '20px', color: '#64748b' }}>MONTHLY_PERFORMANCE</h3>
                 <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                     <thead>
                         <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                             <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950 }}>MONTH</th>
                             <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950 }}>INVOICED</th>
                             <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950 }}>RATE</th>
                         </tr>
                     </thead>
                     <tbody>
                         {matrix.monthly.map((m, idx) => (
                             <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                 <td style={{ padding: '12px 5px', fontSize: '11px', fontWeight: 900 }}>{m.label}</td>
                                 <td style={{ padding: '12px 5px', fontSize: '11px' }}>₹{m.invoiced.toLocaleString()}</td>
                                 <td style={{ padding: '12px 5px', fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>{m.realizationRate}%</td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
             </div>
             <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '30px' }}>
                 <h3 style={{ fontSize: '12px', fontWeight: 950, marginBottom: '20px', color: '#64748b' }}>DAILY_REVENUE_TREND</h3>
                 <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                     <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                         <thead>
                             <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                                 <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950 }}>DATE</th>
                                 <th style={{ padding: '12px 5px', fontSize: '9px', fontWeight: 950 }}>COLLECTED</th>
                             </tr>
                         </thead>
                         <tbody>
                             {matrix.daily.map((d, idx) => (
                                 <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                     <td style={{ padding: '12px 5px', fontSize: '11px', fontWeight: 900 }}>{d.label}</td>
                                     <td style={{ padding: '12px 5px', fontSize: '11px', color: '#059669', fontWeight: 800 }}>₹{d.collected.toLocaleString()}</td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 </div>
             </div>
          </div>
        )}
      </div>

      {isInvoiceDrawerOpen && renderInvoiceDrawer()}
      {isNewInvoiceDrawerOpen && renderNewInvoiceDrawer()}
    </div>
  );
}
