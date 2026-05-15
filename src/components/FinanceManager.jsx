import React, { useState } from 'react';
import apiClient from '../api/apiClient';

const FinanceManager = ({
  isMobile,
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
  TODAY,
  hideTabs = []
}) => {
  const [financeViewMode, setFinanceViewMode] = useState('REGISTRY');

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
    if (regModalityFilter !== 'ALL') {
      list = list.filter(item => item.modality === regModalityFilter);
    }
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
    if (s.includes('COMPLETED') || s.includes('PAID')) return { bg: '#ecfdf5', color: '#059669', label: status };
    if (s.includes('CANCEL') || s.includes('FAILED')) return { bg: '#fef2f2', color: '#dc2626', label: status };
    if (s.includes('PROGRESS') || s.includes('PENDING')) return { bg: '#eff6ff', color: '#2563eb', label: status };
    if (s.includes('ARRIVE') || s.includes('DRAFT')) return { bg: '#fff7ed', color: '#ea580c', label: status };
    return { bg: '#f8fafc', color: '#64748b', label: status };
  };

  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' };

  return (
    <div className="finance-view fade-in">

      {/* Sub-navigation */}
      <div style={{
        display: 'flex', gap: '6px', marginBottom: '28px',
        padding: '5px', background: '#f1f5f9', borderRadius: '12px',
        width: isMobile ? '100%' : 'fit-content',
        overflowX: isMobile ? 'auto' : 'visible',
        scrollbarWidth: 'none', msOverflowStyle: 'none'
      }}>
        {[
          { id: 'REGISTRY', label: 'Services' },
          { id: 'EXPENSES', label: 'Expenses' },
          { id: 'LEDGER',   label: 'Overview' }
        ].filter(tab => !hideTabs.includes(tab.id)).map(tab => (
          <button
            key={tab.id}
            onClick={() => setFinanceViewMode(tab.id)}
            style={{
              padding: '10px 20px', borderRadius: '8px', border: 'none',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              background: financeViewMode === tab.id ? 'white' : 'transparent',
              color: financeViewMode === tab.id ? '#1d4ed8' : '#6b7280',
              boxShadow: financeViewMode === tab.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s', whiteSpace: 'nowrap'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Section header + primary action */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center',
        marginBottom: '28px', gap: '16px'
      }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0a1628', margin: 0 }}>
            {financeViewMode === 'REGISTRY' ? 'Service Prices' :
             financeViewMode === 'EXPENSES' ? 'Expenses' : 'Financial Overview'}
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
            {financeViewMode === 'REGISTRY' ? 'Manage service charges and referral commissions' :
             financeViewMode === 'EXPENSES' ? 'Track operational expenditures' : 'Revenue and expense summary'}
          </p>
        </div>

        {financeViewMode === 'REGISTRY' && (
          <button
            onClick={() => {
              setEditPrice({ modality: '', serviceName: '', amount: 0, referralCutType: 'PERCENTAGE', referralCutValue: 0, referralCutInput: 0 });
              setIsPriceDrawerOpen(true);
            }}
            style={{
              width: isMobile ? '100%' : 'auto',
              padding: '11px 20px', borderRadius: '8px', border: 'none',
              background: '#1d4ed8', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(29,78,216,0.2)'
            }}
          >
            + Add Service
          </button>
        )}

        {financeViewMode === 'EXPENSES' && (
          <button
            onClick={() => {
              setEditExpense({ description: '', category: 'Maintenance', amount: 0, taxAmount: 0, transactionDate: TODAY, paymentMode: 'Cash', referenceNumber: '', vendorName: '', costCenter: 'Radiology', status: 'Paid' });
              setIsExpenseDrawerOpen(true);
            }}
            style={{
              width: isMobile ? '100%' : 'auto',
              padding: '11px 20px', borderRadius: '8px', border: 'none',
              background: '#1e293b', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(30,41,59,0.2)'
            }}
          >
            + Add Expense
          </button>
        )}
      </div>

      {/* ── SERVICES TAB ── */}
      {financeViewMode === 'REGISTRY' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 260px', gap: '24px', alignItems: 'flex-start' }}>

          {/* Service price table */}
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>Modality</label>
                <select
                  value={regModalityFilter}
                  onChange={e => { setRegModalityFilter(e.target.value); setRegCurrentPage(1); }}
                  style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 500, color: '#1d4ed8', outline: 'none', background: 'white' }}
                >
                  <option value="ALL">All modalities</option>
                  {['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'PET-CT'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>{processedRegistry.length} entries</div>
            </div>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <th onClick={() => handleRegSort('modality')} style={{ padding: '14px 24px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#94a3b8', cursor: 'pointer', letterSpacing: '0.3px' }}>
                      Modality {regSortConfig.key === 'modality' ? (regSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    <th onClick={() => handleRegSort('serviceName')} style={{ padding: '14px 24px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#94a3b8', cursor: 'pointer', letterSpacing: '0.3px' }}>
                      Service {regSortConfig.key === 'serviceName' ? (regSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    <th onClick={() => handleRegSort('amount')} style={{ padding: '14px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#94a3b8', cursor: 'pointer', letterSpacing: '0.3px' }}>
                      Charge {regSortConfig.key === 'amount' ? (regSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    <th onClick={() => handleRegSort('referralCutValue')} style={{ padding: '14px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#94a3b8', cursor: 'pointer', letterSpacing: '0.3px' }}>
                      Referral Cut {regSortConfig.key === 'referralCutValue' ? (regSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    <th style={{ padding: '14px 24px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.3px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRegistry.map((spec, idx) => (
                    <tr key={spec.id || idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 24px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'white', background: '#334155', padding: '3px 8px', borderRadius: '5px' }}>{(spec.modality || 'OTHER').toUpperCase()}</span>
                      </td>
                      <td style={{ padding: '14px 24px', fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{spec.serviceName || 'Unnamed Service'}</td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, color: '#1d4ed8' }}>₹{(Number(spec.amount) || 0).toLocaleString()}</td>
                      <td style={{ padding: '14px 16px' }}>
                        {spec.referralCutValue > 0 ? (
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: '4px' }}>
                            ₹{(spec.referralCutValue || 0).toLocaleString()}
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setEditPrice({ ...spec, referralCutType: 'FIXED', referralCutInput: spec.referralCutValue || 0 }); setIsPriceDrawerOpen(true); }}
                            style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: '#374151' }}
                          >Edit</button>
                          <button
                            onClick={() => handleDeletePrice(spec.id)}
                            style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
                          >Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedRegistry.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No services found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ padding: '12px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center', gap: '6px' }}>
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setRegCurrentPage(i + 1)}
                    style={{
                      width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #e2e8f0',
                      fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                      background: regCurrentPage === i + 1 ? '#1d4ed8' : 'white',
                      color: regCurrentPage === i + 1 ? 'white' : '#6b7280'
                    }}
                  >{i + 1}</button>
                ))}
              </div>
            )}
          </div>

          {/* Billing settings */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '24px' }}>Billing Settings</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Auto-Generate Invoice</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Create invoice on appointment completion</div>
                </div>
                <div
                  onClick={handleToggleAutoBill}
                  style={{ width: '44px', height: '24px', background: billingSettings.autoBill ? '#1d4ed8' : '#cbd5e1', borderRadius: '12px', cursor: 'pointer', position: 'relative', transition: 'all 0.3s', flexShrink: 0 }}
                >
                  <div style={{ position: 'absolute', top: '2px', left: billingSettings.autoBill ? '22px' : '2px', width: '20px', height: '20px', background: 'white', borderRadius: '50%', transition: 'all 0.3s' }}></div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                <label style={labelStyle}>Currency Symbol</label>
                <input
                  type="text"
                  value={billingSettings.currency}
                  onChange={e => setBillingSettings(prev => ({ ...prev, currency: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
                  Auto-billing only triggers if the booked service has a matching charge entry in the table on the left.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EXPENSES TAB ── */}
      {financeViewMode === 'EXPENSES' && (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {['Date', 'Vendor', 'Category', 'Amount', 'Status', 'Actions'].map((h, i) => (
                    <th key={h} style={{ padding: '14px 24px', textAlign: i === 5 ? 'right' : 'left', fontSize: '11px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.3px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(expenses || []).map((exp, idx) => {
                  const status = getStatusConfig(exp.status);
                  return (
                    <tr key={exp.id || idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>{new Date(exp.transactionDate).toLocaleDateString()}</td>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{exp.vendorName}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{exp.description}</div>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 500, color: '#475569', background: '#f1f5f9', padding: '3px 8px', borderRadius: '5px' }}>{exp.category}</span>
                      </td>
                      <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>₹{(Number(exp.amount) + (Number(exp.taxAmount) || 0)).toLocaleString()}</td>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: status.color, background: status.bg, padding: '3px 8px', borderRadius: '5px' }}>{status.label}</span>
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button onClick={() => { setEditExpense(exp); setIsExpenseDrawerOpen(true); }} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>Edit</button>
                          <button onClick={() => handleDeleteExpense(exp.id)} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(expenses || []).length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No expenses recorded</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── OVERVIEW TAB ── */}
      {financeViewMode === 'LEDGER' && financialMatrix && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          <div style={{ background: 'white', padding: '28px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gross Revenue</span>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b', marginTop: '12px' }}>₹{(Number(financialMatrix.grossRevenue) || 0).toLocaleString()}</div>
            <div style={{ marginTop: '16px', height: '5px', background: '#f1f5f9', borderRadius: '3px' }}>
              <div style={{ width: '100%', height: '100%', background: '#1d4ed8', borderRadius: '3px' }}></div>
            </div>
            <div style={{ marginTop: '12px', fontSize: '12px', fontWeight: 500, color: '#1d4ed8' }}>Total income collected</div>
          </div>

          <div style={{ background: 'white', padding: '28px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Expenses</span>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#dc2626', marginTop: '12px' }}>₹{(Number(financialMatrix.totalExpenses) || 0).toLocaleString()}</div>
            <div style={{ marginTop: '16px', height: '5px', background: '#f1f5f9', borderRadius: '3px' }}>
              <div style={{ width: `${Math.min((financialMatrix.totalExpenses / (financialMatrix.grossRevenue || 1)) * 100, 100)}%`, height: '100%', background: '#dc2626', borderRadius: '3px' }}></div>
            </div>
            <div style={{ marginTop: '12px', fontSize: '12px', fontWeight: 500, color: '#dc2626' }}>
              {((financialMatrix.totalExpenses / (financialMatrix.grossRevenue || 1)) * 100).toFixed(1)}% of revenue
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #059669 0%, #064e3b 100%)', padding: '28px', borderRadius: '16px', color: 'white' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Net Profit</span>
            <div style={{ fontSize: '32px', fontWeight: 700, color: 'white', marginTop: '12px' }}>₹{(Number(financialMatrix.netIncome) || 0).toLocaleString()}</div>
            <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.15)', padding: '10px 14px', borderRadius: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>
                Margin: {((financialMatrix.netIncome / (financialMatrix.grossRevenue || 1)) * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SERVICE PRICE DRAWER ── */}
      {isPriceDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setIsPriceDrawerOpen(false)} style={{ backdropFilter: 'blur(6px)', background: 'rgba(10,22,40,0.4)', zIndex: 10000 }}>
          <div className="drawer-content" style={{ padding: 0, width: isMobile ? '100%' : '720px', background: 'white' }} onClick={e => e.stopPropagation()}>

            <div style={{ padding: '28px 30px', background: 'linear-gradient(135deg, #1d4ed8 0%, #0a1628 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>Finance → Services</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{editPrice.id ? 'Edit Service' : 'New Service'}</div>
              </div>
              <button onClick={() => setIsPriceDrawerOpen(false)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>

            <div style={{ padding: '30px', overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
              <form onSubmit={handleSavePrice}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '20px' : '36px', alignItems: 'flex-start' }}>

                  {/* Left: core fields */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="form-group">
                      <label style={labelStyle}>Modality</label>
                      <select
                        value={editPrice.modality}
                        onChange={e => setEditPrice({...editPrice, modality: e.target.value})}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 500, background: 'white', outline: 'none' }}
                      >
                        <option value="">Select modality</option>
                        {['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'PET-CT'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <div className="form-group" style={{ opacity: editPrice.modality ? 1 : 0.5, pointerEvents: editPrice.modality ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                      <label style={labelStyle}>Service Name</label>
                      <input
                        type="text" required
                        value={editPrice.serviceName}
                        placeholder={editPrice.modality ? 'e.g. Brain Scan' : 'Select modality first'}
                        onChange={e => setEditPrice({...editPrice, serviceName: e.target.value})}
                        style={{ width: '100%', border: 'none', borderBottom: '2px solid #e2e8f0', fontSize: '15px', fontWeight: 600, padding: '8px 0', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div className="form-group" style={{ opacity: editPrice.serviceName ? 1 : 0.5, pointerEvents: editPrice.serviceName ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                      <label style={labelStyle}>Charge Amount (₹)</label>
                      <input
                        type="number" required
                        value={editPrice.amount || ''}
                        placeholder={editPrice.serviceName ? 'Enter price' : 'Enter service name first'}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          const currentCut = editPrice.referralCutValue || 0;
                          const clampedCut = Math.min(currentCut, val);
                          const calculatedPct = val > 0 ? (clampedCut / val) * 100 : 0;
                          setEditPrice({ ...editPrice, amount: val, referralCutValue: clampedCut, referralCutInput: calculatedPct.toFixed(2) });
                        }}
                        style={{ width: '100%', border: 'none', borderBottom: '2px solid #e2e8f0', fontSize: '22px', fontWeight: 700, padding: '8px 0', outline: 'none', color: '#1d4ed8', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  {/* Right: referral commission */}
                  <div style={{
                    background: editPrice.amount > 0 ? '#f8fafc' : '#f1f5f9',
                    padding: '22px', borderRadius: '14px', border: '1px solid #e2e8f0',
                    opacity: editPrice.amount > 0 ? 1 : 0.6,
                    pointerEvents: editPrice.amount > 0 ? 'auto' : 'none',
                    transition: 'all 0.3s', position: 'relative'
                  }}>
                    {editPrice.amount <= 0 && (
                      <div style={{ position: 'absolute', top: '10px', right: '12px', fontSize: '10px', fontWeight: 600, color: '#d97706', background: '#fffbeb', padding: '3px 8px', borderRadius: '5px', border: '1px solid #fef3c7' }}>
                        Optional
                      </div>
                    )}
                    <label style={{ ...labelStyle, color: '#1d4ed8', fontSize: '12px' }}>Referral Commission</label>

                    <div style={{ marginBottom: '20px' }}>
                      <input
                        type="range" min="0" max="100" step="0.5"
                        value={editPrice.referralCutInput || 0}
                        onChange={e => {
                          const pct = parseFloat(e.target.value);
                          const calculated = (editPrice.amount * pct) / 100;
                          const clamped = Math.min(calculated, editPrice.amount);
                          const finalPct = editPrice.amount > 0 ? (clamped / editPrice.amount) * 100 : 0;
                          setEditPrice({...editPrice, referralCutInput: finalPct.toFixed(2), referralCutValue: clamped});
                        }}
                        style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '3px', accentColor: '#1d4ed8', cursor: 'pointer' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div className="form-group">
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Percent (%)</label>
                        <input
                          type="number"
                          value={editPrice.referralCutInput}
                          placeholder="0"
                          onChange={e => {
                            const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                            const num = parseFloat(val) || 0;
                            const calculated = (editPrice.amount * num) / 100;
                            const clamped = Math.min(calculated, editPrice.amount);
                            setEditPrice({...editPrice, referralCutInput: val, referralCutValue: clamped});
                          }}
                          style={{ width: '100%', border: 'none', borderBottom: '1px solid #e2e8f0', fontSize: '14px', fontWeight: 600, padding: '8px 0', outline: 'none', background: 'transparent', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div className="form-group">
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Amount (₹)</label>
                        <input
                          type="number"
                          value={editPrice.referralCutValue}
                          placeholder="0"
                          onChange={e => {
                            const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                            const num = parseFloat(val) || 0;
                            const clamped = Math.min(num, editPrice.amount);
                            const calculatedPct = editPrice.amount > 0 ? (clamped / editPrice.amount) * 100 : 0;
                            setEditPrice({...editPrice, referralCutValue: val === '' ? '' : clamped, referralCutInput: calculatedPct.toFixed(2)});
                          }}
                          style={{ width: '100%', border: 'none', borderBottom: '1px solid #e2e8f0', fontSize: '14px', fontWeight: 600, padding: '8px 0', outline: 'none', color: '#1d4ed8', background: 'transparent', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: '12px', color: '#1d4ed8', marginTop: '18px', fontWeight: 600, background: 'white', padding: '10px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0' }}>
                      <span>Commission amount</span>
                      <span style={{ fontSize: '14px' }}>₹{(editPrice.referralCutValue || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '32px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setIsPriceDrawerOpen(false)} style={{ padding: '11px 24px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: 'white', color: '#374151' }}>Cancel</button>
                  <button type="submit" style={{ padding: '11px 28px', borderRadius: '8px', border: 'none', background: '#1d4ed8', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(29,78,216,0.2)' }}>Save Service</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── EXPENSE DRAWER ── */}
      {isExpenseDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setIsExpenseDrawerOpen(false)} style={{ backdropFilter: 'blur(6px)', background: 'rgba(10,22,40,0.4)', zIndex: 10000 }}>
          <div className="drawer-content" style={{ padding: 0, width: isMobile ? '100%' : '480px', background: 'white' }} onClick={e => e.stopPropagation()}>

            <div style={{ padding: '28px 30px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>Finance → Expenses</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{editExpense.id ? 'Edit Expense' : 'Add Expense'}</div>
              </div>
              <button onClick={() => setIsExpenseDrawerOpen(false)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>

            <div style={{ padding: '28px 30px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              <form onSubmit={handleSaveExpense}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                    <div className="form-group">
                      <label style={labelStyle}>Date</label>
                      <input
                        type="date" required
                        value={editExpense.transactionDate}
                        onChange={e => setEditExpense({...editExpense, transactionDate: e.target.value})}
                        style={{ width: '100%', border: 'none', borderBottom: '2px solid #e2e8f0', fontSize: '14px', fontWeight: 500, padding: '8px 0', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={labelStyle}>Status</label>
                      <select
                        value={editExpense.status}
                        onChange={e => setEditExpense({...editExpense, status: e.target.value})}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 500, background: 'white', outline: 'none' }}
                      >
                        {['Draft', 'Pending', 'Approved', 'Paid'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={labelStyle}>Vendor / Payee</label>
                    <input
                      type="text" required
                      value={editExpense.vendorName}
                      placeholder="e.g. Reliance Energy or Global Reagents Ltd"
                      onChange={e => setEditExpense({...editExpense, vendorName: e.target.value})}
                      style={{ width: '100%', border: 'none', borderBottom: '2px solid #e2e8f0', fontSize: '15px', fontWeight: 600, padding: '8px 0', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '18px' }}>
                    <div className="form-group">
                      <label style={labelStyle}>Category</label>
                      <select
                        value={editExpense.category}
                        onChange={e => setEditExpense({...editExpense, category: e.target.value})}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 500, background: 'white', outline: 'none' }}
                      >
                        {['Maintenance', 'Staff Salary', 'Utilities', 'Reagents', 'Marketing', 'Rent', 'Consumables', 'Other'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label style={labelStyle}>Cost Center</label>
                      <select
                        value={editExpense.costCenter}
                        onChange={e => setEditExpense({...editExpense, costCenter: e.target.value})}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 500, background: 'white', outline: 'none' }}
                      >
                        {['Radiology', 'Laboratory', 'Pharmacy', 'OPD', 'Administration', 'Logistics'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={labelStyle}>Description</label>
                    <input
                      type="text" required
                      value={editExpense.description}
                      placeholder="Detailed breakdown of the expenditure..."
                      onChange={e => setEditExpense({...editExpense, description: e.target.value})}
                      style={{ width: '100%', border: 'none', borderBottom: '2px solid #e2e8f0', fontSize: '14px', fontWeight: 500, padding: '8px 0', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                    <div className="form-group">
                      <label style={labelStyle}>Amount (₹)</label>
                      <input
                        type="number" required
                        value={editExpense.amount}
                        onChange={e => setEditExpense({...editExpense, amount: parseFloat(e.target.value)})}
                        style={{ width: '100%', border: 'none', borderBottom: '2px solid #e2e8f0', fontSize: '18px', fontWeight: 700, padding: '8px 0', outline: 'none', color: '#1e293b', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={labelStyle}>Tax / GST (₹)</label>
                      <input
                        type="number"
                        value={editExpense.taxAmount}
                        onChange={e => setEditExpense({...editExpense, taxAmount: parseFloat(e.target.value)})}
                        style={{ width: '100%', border: 'none', borderBottom: '2px solid #e2e8f0', fontSize: '18px', fontWeight: 700, padding: '8px 0', outline: 'none', color: '#6b7280', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                    <div className="form-group">
                      <label style={labelStyle}>Payment Mode</label>
                      <select
                        value={editExpense.paymentMode}
                        onChange={e => setEditExpense({...editExpense, paymentMode: e.target.value})}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 500, background: 'white', outline: 'none' }}
                      >
                        {['Cash', 'UPI', 'Bank Transfer', 'Cheque'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label style={labelStyle}>Reference No.</label>
                      <input
                        type="text"
                        value={editExpense.referenceNumber}
                        placeholder="TXN / Bill ID"
                        onChange={e => setEditExpense({...editExpense, referenceNumber: e.target.value})}
                        style={{ width: '100%', border: 'none', borderBottom: '2px solid #e2e8f0', fontSize: '13px', fontWeight: 500, padding: '8px 0', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
                  <button type="button" onClick={() => setIsExpenseDrawerOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: 'white', color: '#374151' }}>Cancel</button>
                  <button type="submit" disabled={savingExpense} style={{ flex: 2, padding: '12px', borderRadius: '8px', border: 'none', background: '#1e293b', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                    {savingExpense ? 'Saving...' : 'Save Expense'}
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
