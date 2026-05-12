import React, { useState } from 'react';
import apiClient from '../api/apiClient';

const FinanceManager = ({ 
  servicePrices, 
  fetchServicePrices, 
  financialMatrix, 
  fetchFinancialMatrix,
  expenses,
  fetchExpenses,
  billingSettings,
  setBillingSettings,
  handleToggleAutoBill,
  isOnline,
  activeCenter,
  isPriceDrawerOpen,
  setIsPriceDrawerOpen,
  editPrice,
  setEditPrice,
  handleSavePrice,
  handleDeletePrice,
  isExpenseDrawerOpen,
  setIsExpenseDrawerOpen,
  editExpense,
  setEditExpense,
  handleSaveExpense,
  handleDeleteExpense,
  savingExpense,
  isTestMode,
  TODAY
}) => {
  const [financeViewMode, setFinanceViewMode] = useState('REGISTRY'); // 'REGISTRY', 'EXPENSES', 'LEDGER'
  
  // --- REGISTRY STATE MGMT ---
  const [regModalityFilter, setRegModalityFilter] = useState('ALL');
  const [regSortConfig, setRegSortConfig] = useState({ key: 'modality', direction: 'asc' });
  const [regCurrentPage, setRegCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const handleRegSort = (key) => {
    setRegSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getFilteredAndSortedRegistry = () => {
    let list = [...(servicePrices || [])];
    
    // 1. Filter
    if (regModalityFilter !== 'ALL') {
      list = list.filter(item => item.modality === regModalityFilter);
    }

    // 2. Sort
    list.sort((a, b) => {
      let valA = a[regSortConfig.key];
      let valB = b[regSortConfig.key];
      
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      
      if (valA < valB) return regSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return regSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  };

  const processedRegistry = getFilteredAndSortedRegistry();
  const totalPages = Math.ceil(processedRegistry.length / ITEMS_PER_PAGE);
  const paginatedRegistry = processedRegistry.slice(
    (regCurrentPage - 1) * ITEMS_PER_PAGE,
    regCurrentPage * ITEMS_PER_PAGE
  );

  const getStatusConfig = (status) => {
    const s = status?.toUpperCase() || 'UNKNOWN';
    if (s.includes('COMPLETED') || s.includes('PAID')) return { bg: '#ecfdf5', color: '#059669', label: s };
    if (s.includes('CANCEL') || s.includes('FAILED')) return { bg: '#fef2f2', color: '#dc2626', label: s };
    if (s.includes('PROGRESS') || s.includes('PENDING')) return { bg: '#eff6ff', color: '#2563eb', label: s };
    if (s.includes('ARRIVE') || s.includes('DRAFT')) return { bg: '#fff7ed', color: '#ea580c', label: s };
    return { bg: '#f8fafc', color: '#64748b', label: s };
  };

  return (
    <div className="finance-view fade-in">
      {/* Sub-Navigation for Finance */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '30px',
        padding: '6px',
        background: '#f1f5f9',
        borderRadius: '16px',
        width: 'fit-content'
      }}>
        {[
          { id: 'REGISTRY', label: 'SERVICE REGISTRY' },
          { id: 'EXPENSES', label: 'EXPENSE LEDGER' },
          { id: 'LEDGER', label: 'FINANCIAL MATRIX' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFinanceViewMode(tab.id)}
            style={{
              padding: '10px 20px',
              borderRadius: '12px',
              border: 'none',
              fontSize: '10px',
              fontWeight: 950,
              cursor: 'pointer',
              background: financeViewMode === tab.id ? 'white' : 'transparent',
              color: financeViewMode === tab.id ? '#0f52ba' : '#64748b',
              boxShadow: financeViewMode === tab.id ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
        <div>
          <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#0f52ba', marginBottom: '4px' }}>
            {financeViewMode === 'REGISTRY' ? 'Financial Infrastructure' : 
             financeViewMode === 'EXPENSES' ? 'Operational Expenditures' : 'Institutional Yield Matrix'}
          </h2>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginTop: '10px' }}>
              <div style={{ display: 'flex', background: '#f1f5f9', padding: '8px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 950, color: '#0f52ba' }}>
                 {financeViewMode === 'REGISTRY' ? 'SERVICE REGISTRY PROTOCOL' : 
                  financeViewMode === 'EXPENSES' ? 'FISCAL DEBIT LOG' : 'STRATEGIC REVENUE ANALYTICS'}
              </div>
          </div>
        </div>
        
        {financeViewMode === 'REGISTRY' && (
          <button 
            onClick={() => { 
              setEditPrice({ 
                modality: '', 
                serviceName: '', 
                amount: 0, 
                referralCutType: 'PERCENTAGE', 
                referralCutValue: 0,
                referralCutInput: 0
              }); 
              setIsPriceDrawerOpen(true); 
            }}
            style={{ 
              padding: '12px 24px', borderRadius: '12px', border: 'none', 
              background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(15, 82, 186, 0.2)'
            }}
          >
            + ADD SERVICE CHARGE
          </button>
        )}

        {financeViewMode === 'EXPENSES' && (
          <button 
            onClick={() => { 
              setEditExpense({ 
                description: '', category: 'Maintenance', amount: 0, taxAmount: 0, 
                transactionDate: TODAY, paymentMode: 'Cash', referenceNumber: '', 
                vendorName: '', costCenter: 'Radiology', status: 'Paid' 
              }); 
              setIsExpenseDrawerOpen(true); 
            }}
            style={{ 
              padding: '12px 24px', borderRadius: '12px', border: 'none', 
              background: '#1e293b', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(30, 41, 59, 0.2)'
            }}
          >
            + RECORD EXPENDITURE
          </button>
        )}
      </div>

      {financeViewMode === 'REGISTRY' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '30px', alignItems: 'flex-start' }}>
          {/* Service Price Registry */}
          <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
            <div style={{ padding: '20px 30px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <label style={{ fontSize: '9px', fontWeight: 950, color: '#64748b' }}>FILTER_MODALITY:</label>
                  <select 
                    value={regModalityFilter}
                    onChange={e => { setRegModalityFilter(e.target.value); setRegCurrentPage(1); }}
                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 800, color: '#0f52ba', outline: 'none' }}
                  >
                    <option value="ALL">ALL_MODALITIES</option>
                    {['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'PET-CT'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
               </div>
               <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>TOTAL_ENTRIES: {processedRegistry.length}</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <th onClick={() => handleRegSort('modality')} style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', cursor: 'pointer' }}>
                    MODALITY {regSortConfig.key === 'modality' ? (regSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th onClick={() => handleRegSort('serviceName')} style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', cursor: 'pointer' }}>
                    SERVICE_NAME {regSortConfig.key === 'serviceName' ? (regSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th onClick={() => handleRegSort('amount')} style={{ padding: '20px 20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', cursor: 'pointer' }}>
                    CHARGE {regSortConfig.key === 'amount' ? (regSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th onClick={() => handleRegSort('referralCutValue')} style={{ padding: '20px 20px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', cursor: 'pointer' }}>
                    REF_CUT {regSortConfig.key === 'referralCutValue' ? (regSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRegistry.map((spec, idx) => (
                  <tr key={spec.id || idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                    <td style={{ padding: '15px 30px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 950, color: 'white', background: '#334155', padding: '4px 10px', borderRadius: '6px' }}>{(spec.modality || 'OTHER').toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '15px 30px', fontSize: '12px', fontWeight: 850, color: '#1e293b' }}>{(spec.serviceName || 'Unnamed Service').toUpperCase()}</td>
                    <td style={{ padding: '15px 20px', fontSize: '13px', fontWeight: 950, color: '#0f52ba' }}>₹{(Number(spec.amount) || 0).toLocaleString()}</td>
                    <td style={{ padding: '15px 20px' }}>
                       {spec.referralCutValue > 0 ? (
                         <span style={{ fontSize: '11px', fontWeight: 950, color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: '4px' }}>
                           ₹{(spec.referralCutValue || 0).toLocaleString()}
                         </span>
                       ) : (
                         <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>N/A</span>
                       )}
                    </td>
                    <td style={{ padding: '15px 30px', textAlign: 'right' }}>
                       <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => { 
                              setEditPrice({
                                ...spec,
                                referralCutType: 'FIXED',
                                referralCutInput: spec.referralCutValue || 0
                              }); 
                              setIsPriceDrawerOpen(true); 
                            }} 
                            style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '9px', fontWeight: 800 }}
                          >
                            EDIT
                          </button>
                          <button onClick={() => handleDeletePrice(spec.id)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '9px', fontWeight: 800 }}>DEL</button>
                       </div>
                    </td>
                  </tr>
                ))}
                {paginatedRegistry.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 700 }}>NO MATCHING RECORDS FOUND</td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {totalPages > 1 && (
              <div style={{ padding: '15px 30px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                 {[...Array(totalPages)].map((_, i) => (
                   <button 
                     key={i} 
                     onClick={() => setRegCurrentPage(i + 1)}
                     style={{ 
                       width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #e2e8f0', 
                       fontSize: '10px', fontWeight: 950, cursor: 'pointer',
                       background: regCurrentPage === i + 1 ? '#0f52ba' : 'white',
                       color: regCurrentPage === i + 1 ? 'white' : '#64748b'
                     }}
                   >
                     {i + 1}
                   </button>
                 ))}
              </div>
            )}
          </div>

          {/* Billing Protocol Settings */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '25px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '30px' }}>Global Billing Protocol</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div>
                    <div style={{ fontSize: '12px', fontWeight: 850, color: '#1e293b' }}>Auto-Generate Billing</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Create invoice on mission deployment</div>
                 </div>
                 <div 
                    onClick={handleToggleAutoBill}
                    style={{ 
                      width: '44px', height: '24px', background: billingSettings.autoBill ? '#0f52ba' : '#cbd5e1', 
                      borderRadius: '12px', cursor: 'pointer', position: 'relative', transition: 'all 0.3s' 
                    }}
                 >
                    <div style={{ 
                      position: 'absolute', top: '2px', left: billingSettings.autoBill ? '22px' : '2px', 
                      width: '20px', height: '20px', background: 'white', borderRadius: '50%', transition: 'all 0.3s' 
                    }}></div>
                 </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '25px' }}>
                 <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', marginBottom: '15px' }}>CURRENCY SYMBOL</div>
                 <input 
                    type="text" 
                    value={billingSettings.currency} 
                    onChange={e => setBillingSettings(prev => ({ ...prev, currency: e.target.value }))}
                    style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800 }}
                 />
              </div>

              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #edf2f7', marginTop: '10px' }}>
                 <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>
                   <strong>NOTE:</strong> Automated billing will only trigger if the specific service booked has a matching charge entry in the registry on the left.
                 </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {financeViewMode === 'EXPENSES' && (
        <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>DATE</th>
                <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>PAYEE / VENDOR</th>
                <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>CATEGORY</th>
                <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>AMOUNT</th>
                <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>STATUS</th>
                <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {(expenses || []).map((exp, idx) => {
                const status = getStatusConfig(exp.status);
                return (
                  <tr key={exp.id || idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                    <td style={{ padding: '20px 30px', fontSize: '12px', fontWeight: 800, color: '#64748b' }}>{new Date(exp.transactionDate).toLocaleDateString()}</td>
                    <td style={{ padding: '20px 30px' }}>
                       <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{exp.vendorName?.toUpperCase()}</div>
                       <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', fontWeight: 700 }}>{exp.description}</div>
                    </td>
                    <td style={{ padding: '20px 30px' }}>
                       <span style={{ fontSize: '9px', fontWeight: 950, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>{exp.category?.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '20px 30px', fontSize: '14px', fontWeight: 950, color: '#dc2626' }}>₹{(Number(exp.amount) + (Number(exp.taxAmount) || 0)).toLocaleString()}</td>
                    <td style={{ padding: '20px 30px' }}>
                       <span style={{ fontSize: '9px', fontWeight: 950, color: status.color, background: status.bg, padding: '4px 10px', borderRadius: '6px' }}>{status.label}</span>
                    </td>
                    <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                       <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => { setEditExpense(exp); setIsExpenseDrawerOpen(true); }} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '10px', fontWeight: 800 }}>EDIT</button>
                          <button onClick={() => handleDeleteExpense(exp.id)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '10px', fontWeight: 800 }}>DELETE</button>
                       </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {financeViewMode === 'LEDGER' && financialMatrix && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
          {/* Revenue Card */}
          <div style={{ background: 'white', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
             <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '2px', textTransform: 'uppercase' }}>Gross Revenue</span>
             <div style={{ fontSize: '32px', fontWeight: 950, color: '#1e293b', marginTop: '15px' }}>₹{(Number(financialMatrix.grossRevenue) || 0).toLocaleString()}</div>
             <div style={{ marginTop: '20px', height: '6px', background: '#f1f5f9', borderRadius: '3px' }}>
                <div style={{ width: '100%', height: '100%', background: '#0f52ba', borderRadius: '3px' }}></div>
             </div>
             <div style={{ marginTop: '15px', fontSize: '10px', fontWeight: 800, color: '#0f52ba' }}>TOTAL SETTLEMENTS REALIZED</div>
          </div>

          {/* Expense Card */}
          <div style={{ background: 'white', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
             <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '2px', textTransform: 'uppercase' }}>Total Expenditures</span>
             <div style={{ fontSize: '32px', fontWeight: 950, color: '#dc2626', marginTop: '15px' }}>₹{(Number(financialMatrix.totalExpenses) || 0).toLocaleString()}</div>
             <div style={{ marginTop: '20px', height: '6px', background: '#f1f5f9', borderRadius: '3px' }}>
                <div style={{ width: `${(financialMatrix.totalExpenses / (financialMatrix.grossRevenue || 1)) * 100}%`, height: '100%', background: '#dc2626', borderRadius: '3px' }}></div>
             </div>
             <div style={{ marginTop: '15px', fontSize: '10px', fontWeight: 800, color: '#dc2626' }}>BURN RATE: {((financialMatrix.totalExpenses / (financialMatrix.grossRevenue || 1)) * 100).toFixed(1)}% OF GROSS</div>
          </div>

          {/* Net Profit Card */}
          <div style={{ background: 'linear-gradient(135deg, #059669 0%, #064e3b 100%)', padding: '30px', borderRadius: '24px', color: 'white' }}>
             <span style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase' }}>Net Institutional Gain</span>
             <div style={{ fontSize: '32px', fontWeight: 950, color: 'white', marginTop: '15px' }}>₹{(Number(financialMatrix.netIncome) || 0).toLocaleString()}</div>
             <div style={{ marginTop: '20px', background: 'rgba(255,255,255,0.1)', padding: '10px 15px', borderRadius: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 950 }}>MARGIN: {((financialMatrix.netIncome / (financialMatrix.grossRevenue || 1)) * 100).toFixed(1)}%</div>
             </div>
          </div>
        </div>
      )}

      {/* --- DRAWERS --- */}
      {isPriceDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setIsPriceDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
          <div className="drawer-content" style={{ padding: 0, width: '750px', background: 'white' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '30px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                     <h2 style={{ fontSize: '10px', fontWeight: 950, color: 'var(--tactical-cyan)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '4px' }}>Financial Infrastructure</h2>
                     <div style={{ fontSize: '18px', fontWeight: 950, letterSpacing: '-0.5px' }}>{editPrice.id ? 'CONFIG_SERVICE_CHARGE' : 'INIT_NEW_CHARGE'}</div>
                  </div>
                  <button onClick={() => setIsPriceDrawerOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px' }}>&times;</button>
               </div>
            </div>

            <div style={{ padding: '30px' }}>
               <form onSubmit={handleSavePrice}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'flex-start' }}>
                     
                     {/* Left Column: Core Parameters */}
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                        <div className="form-group">
                           <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>MODALITY_BRANCH (1)</label>
                           <select 
                              value={editPrice.modality} 
                              onChange={e => setEditPrice({...editPrice, modality: e.target.value})}
                              style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                           >
                             <option value="">SELECT_MODALITY</option>
                             {['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'PET-CT'].map(m => <option key={m} value={m}>{m}</option>)}
                           </select>
                        </div>

                        <div className="form-group" style={{ opacity: editPrice.modality ? 1 : 0.5, pointerEvents: editPrice.modality ? 'auto' : 'none', transition: 'all 0.3s' }}>
                           <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>SERVICE_DESCRIPTOR (2)</label>
                           <input 
                              type="text" required 
                              value={editPrice.serviceName} 
                              placeholder={editPrice.modality ? "e.g. BRAIN_SCAN" : "SELECT_MODALITY_FIRST"}
                              onChange={e => setEditPrice({...editPrice, serviceName: e.target.value})}
                              style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '15px', fontWeight: 800, padding: '10px 0', outline: 'none' }}
                           />
                        </div>

                        <div className="form-group" style={{ opacity: editPrice.serviceName ? 1 : 0.5, pointerEvents: editPrice.serviceName ? 'auto' : 'none', transition: 'all 0.3s' }}>
                           <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>STANDARD_FINANCIAL_UNIT (3)</label>
                           <input 
                              type="number" required 
                              value={editPrice.amount || ''} 
                              placeholder={editPrice.serviceName ? "Enter price" : "ENTER_DESCRIPTOR_FIRST"}
                              onChange={e => setEditPrice({...editPrice, amount: parseFloat(e.target.value) || 0})}
                              style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '20px', fontWeight: 950, padding: '10px 0', outline: 'none', color: '#0f52ba' }}
                           />
                        </div>
                     </div>

                   {/* Right Column: Incentive Protocol (Synchronized) */}
                   <div style={{ 
                      background: editPrice.amount > 0 ? '#f8fafc' : '#f1f5f9', 
                      padding: '25px', 
                      borderRadius: '20px', 
                      border: '1px solid #f1f5f9',
                      position: 'relative',
                      opacity: editPrice.amount > 0 ? 1 : 0.6,
                      pointerEvents: editPrice.amount > 0 ? 'auto' : 'none',
                      transition: 'all 0.3s'
                   }}>
                      {editPrice.amount <= 0 && (
                        <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '8px', fontWeight: 900, color: '#f59e0b', background: '#fffbeb', padding: '4px 8px', borderRadius: '6px', border: '1px solid #fef3c7' }}>
                           (4)_OPTIONAL_PROTOCOL
                        </div>
                      )}
                      
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', marginBottom: '20px' }}>REFERRAL_INCENTIVE_PROTOCOL</label>
                      
                      <div style={{ marginBottom: '25px' }}>
                         <input 
                           type="range" min="0" max="100" step="0.5"
                           value={editPrice.referralCutInput || 0}
                           onChange={e => {
                             const pct = parseFloat(e.target.value);
                             const calculated = (editPrice.amount * pct) / 100;
                             setEditPrice({...editPrice, referralCutInput: pct, referralCutValue: calculated});
                           }}
                           style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', accentColor: '#0f52ba', cursor: 'pointer' }}
                         />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                         <div className="form-group">
                            <label style={{ display: 'block', fontSize: '8px', fontWeight: 900, color: '#94a3b8', marginBottom: '8px' }}>PERCENT (%)</label>
                            <input 
                               type="number" 
                               value={editPrice.referralCutInput}
                               placeholder="0"
                               onChange={e => {
                                 const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                 const num = parseFloat(val) || 0;
                                 const calculated = (editPrice.amount * num) / 100;
                                 setEditPrice({...editPrice, referralCutInput: val, referralCutValue: calculated});
                               }}
                               style={{ width: '100%', border: 'none', borderBottom: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 800, padding: '8px 0', outline: 'none', background: 'transparent' }}
                            />
                         </div>

                         <div className="form-group">
                            <label style={{ display: 'block', fontSize: '8px', fontWeight: 900, color: '#94a3b8', marginBottom: '8px' }}>AMOUNT (₹)</label>
                            <input 
                               type="number" 
                               value={editPrice.referralCutValue} 
                               placeholder="0"
                               onChange={e => {
                                 const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                 const num = parseFloat(val) || 0;
                                 const calculatedPct = editPrice.amount > 0 ? (num / editPrice.amount) * 100 : 0;
                                 setEditPrice({...editPrice, referralCutValue: val, referralCutInput: calculatedPct.toFixed(2)});
                               }}
                               style={{ width: '100%', border: 'none', borderBottom: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 800, padding: '8px 0', outline: 'none', color: '#0f52ba', background: 'transparent' }}
                            />
                         </div>
                      </div>
                      
                      <div style={{ fontSize: '9px', color: '#0f52ba', marginTop: '20px', fontWeight: 900, background: 'white', padding: '10px 15px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0' }}>
                         <span>COMMIT_VALUE</span>
                         <span style={{ fontSize: '12px' }}>₹{(editPrice.referralCutValue || 0).toLocaleString()}</span>
                      </div>
                   </div>
                  </div>

                  <div style={{ marginTop: '35px', display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
                     <button type="button" onClick={() => setIsPriceDrawerOpen(false)} style={{ width: '120px', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>ABORT</button>
                     <button type="submit" style={{ width: '240px', padding: '14px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 8px 20px rgba(15, 82, 186, 0.2)' }}>SAVE FINANCIAL PROTOCOL →</button>
                  </div>
               </form>
            </div>
          </div>
        </div>
      )}

      {isExpenseDrawerOpen && (
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
                       <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>VENDOR / PAYEE IDENTITY</label>
                       <input 
                          type="text" required 
                          value={editExpense.vendorName} 
                          placeholder="e.g. Reliance Energy or Global Reagents Ltd"
                          onChange={e => setEditExpense({...editExpense, vendorName: e.target.value})}
                          style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '15px', fontWeight: 800, padding: '10px 0', outline: 'none' }}
                       />
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
      )}
    </div>
  );
};

export default FinanceManager;
