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
  const [showAutoBillConfirm, setShowAutoBillConfirm] = useState(false);

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
                  onClick={() => setShowAutoBillConfirm(true)}
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
      {financeViewMode === 'LEDGER' && financialMatrix && (() => {
        const perf = financialMatrix.performance || {};
        const aging = financialMatrix.agingDues || {};
        const discounts = financialMatrix.discountAllocations || {};
        const modalities = financialMatrix.modalityProfitability || [];
        const physicianRoi = financialMatrix.physicianRoiLedger || [];
        const leakage = financialMatrix.leakageAudits || [];

        const totalExp = expenses ? expenses.reduce((acc, curr) => acc + Number(curr.amount) + (Number(curr.taxAmount) || 0), 0) : 0;
        const gross = Number(perf.grossRevenue) || 0;
        const netProfitValue = gross - totalExp;
        const marginPct = gross > 0 ? (netProfitValue / gross) * 100 : 0;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {/* Core Financial KPI Dashboard Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              
              {/* Gross Revenue Card */}
              <div style={{ background: 'white', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Gross Invoiced Revenue</span>
                <div style={{ fontSize: '28px', fontWeight: 950, color: '#1e293b', marginTop: '12px' }}>₹{gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '10px', fontWeight: 900, color: '#059669' }}>
                   <span>📈 NOMINAL VALUE REALIZED</span>
                </div>
              </div>

              {/* Total Expenses Card */}
              <div style={{ background: 'white', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Total Expenditures</span>
                <div style={{ fontSize: '28px', fontWeight: 950, color: '#dc2626', marginTop: '12px' }}>₹{totalExp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '10px', fontWeight: 800, color: '#64748b' }}>
                   <span>{gross > 0 ? ((totalExp / gross) * 100).toFixed(1) : '0.0'}% of Gross Billing</span>
                </div>
              </div>

              {/* Net Profit Card */}
              <div style={{ background: 'linear-gradient(135deg, #059669 0%, #064e3b 100%)', padding: '24px', borderRadius: '20px', color: 'white', boxShadow: '0 4px 20px rgba(5,150,105,0.15)' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#a7f3d0', textTransform: 'uppercase', letterSpacing: '2px' }}>Operating Net Profit</span>
                <div style={{ fontSize: '28px', fontWeight: 950, color: 'white', marginTop: '12px' }}>₹{netProfitValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '10px', fontWeight: 900, color: '#a7f3d0' }}>
                   <span>Yield Margin: {marginPct.toFixed(1)}%</span>
                </div>
              </div>

              {/* Outstanding AR Card */}
              <div style={{ background: 'white', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Outstanding Dues (A/R)</span>
                <div style={{ fontSize: '28px', fontWeight: 950, color: '#d97706', marginTop: '12px' }}>₹{(Number(perf.outstandingAR) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '10px', fontWeight: 800, color: '#d97706' }}>
                   <span>⚠️ {((Number(perf.outstandingAR) || 0) > 0 && gross > 0 ? ((Number(perf.outstandingAR) / gross) * 100).toFixed(1) : '0.0')}% unpaid book dues</span>
                </div>
              </div>

            </div>

            {/* Visual Section 1: A/R Aging Stacked Ledger & Discount Allocations */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: '24px' }}>
              
              {/* Accounts Receivable (AR) Aging Buckets */}
              <div style={{ background: 'white', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                 <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '25px' }}>Accounts Receivable (A/R) Aging Buckets</div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {[
                      { label: '0 - 30 Days (Current)', value: Number(aging.bucket0To30) || 0, color: '#2563eb' },
                      { label: '31 - 60 Days (Grace)', value: Number(aging.bucket31To60) || 0, color: '#f59e0b' },
                      { label: '61 - 90 Days (Overdue)', value: Number(aging.bucket61To90) || 0, color: '#ea580c' },
                      { label: '91+ Days (Critical Debt)', value: Number(aging.bucket91Plus) || 0, color: '#dc2626' }
                    ].map((bucket, i) => {
                      const totalOutstanding = Number(aging.totalOutstanding) || 1;
                      const percentage = (bucket.value / totalOutstanding) * 100;
                      return (
                        <div key={bucket.label}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px', fontWeight: 950 }}>
                              <span style={{ color: '#1e293b' }}>{bucket.label.toUpperCase()}</span>
                              <span style={{ color: bucket.color }}>₹{bucket.value.toLocaleString()} ({percentage.toFixed(1)}%)</span>
                           </div>
                           <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${percentage}%`, height: '100%', background: bucket.color, borderRadius: '4px' }}></div>
                           </div>
                        </div>
                      );
                    })}

                 </div>
              </div>

              {/* Discount & Concession Distribution */}
              <div style={{ background: 'white', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                 <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '25px' }}>Discount & Concession Breakdowns</div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {[
                      { label: 'REFERRED DOCTORS', value: Number(discounts.referral) || 0, color: '#6c5ce7' },
                      { label: 'SENIOR CITIZENS', value: Number(discounts.seniorCitizen) || 0, color: '#0f52ba' },
                      { label: 'CORPORATE CONCESSIONS', value: Number(discounts.corporate) || 0, color: '#2ecc71' },
                      { label: 'PROMOTIONAL OFFERINGS', value: Number(discounts.promotional) || 0, color: '#f39c12' }
                    ].map((disc, idx) => {
                      const totalDiscounts = Object.values(discounts).reduce((a, b) => Number(a) + Number(b), 0) || 1;
                      const percentage = (disc.value / totalDiscounts) * 100;
                      return (
                        <div key={disc.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                           <span style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: disc.color }}></div>
                              {disc.label}
                           </span>
                           <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>₹{disc.value.toLocaleString()}</span>
                        </div>
                      );
                    })}

                 </div>
              </div>

            </div>

            {/* Visual Section 2: Modality Operating Margin Matrix */}
            <div style={{ background: 'white', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '25px' }}>Modality Profitability & Operating Margins</div>
              <div style={{ overflowX: 'auto' }}>
                 <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                       <tr style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '12px' }}>
                          {['Modality', 'Study Count', 'Gross Revenue', 'Referral Cut Paid', 'Net Yield', 'Margin %', 'Collection Efficiency'].map((th, i) => (
                             <th key={th} style={{ padding: '12px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: '9px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase' }}>{th}</th>
                          ))}
                       </tr>
                    </thead>
                    <tbody>
                       {modalities.map((mod, idx) => (
                          <tr key={mod.modality || idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                             <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>
                                <span style={{ padding: '4px 8px', borderRadius: '6px', background: '#334155', color: 'white', fontSize: '9px', fontWeight: 900 }}>{(mod.modality || 'OTHER').toUpperCase()}</span>
                             </td>
                             <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 800, color: '#64748b' }}>{mod.scanCount || 0} Scans</td>
                             <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>₹{(mod.grossRevenue || 0).toLocaleString()}</td>
                             <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 850, color: '#dc2626' }}>₹{(mod.referralCut || 0).toLocaleString()}</td>
                             <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 850, color: '#059669' }}>₹{(mod.netRevenue || 0).toLocaleString()}</td>
                             <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                   <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{mod.marginPercentage}%</span>
                                   <div style={{ width: '50px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                      <div style={{ width: `${mod.marginPercentage}%`, height: '100%', background: '#059669', borderRadius: '3px' }}></div>
                                   </div>
                                </div>
                             </td>
                             <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                   <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{mod.collectionEfficiency}%</span>
                                   <div style={{ width: '50px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                      <div style={{ width: `${mod.collectionEfficiency}%`, height: '100%', background: '#2563eb', borderRadius: '3px' }}></div>
                                   </div>
                                </div>
                             </td>
                          </tr>
                       ))}
                       {modalities.length === 0 && (
                          <tr>
                             <td colSpan="7" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No Modality profitability metrics loaded.</td>
                          </tr>
                       )}
                    </tbody>
                 </table>
              </div>
            </div>

            {/* Visual Section 3: Physician Referral ROI & Concession Leakage Ledger */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', gap: '24px' }}>
              
              {/* Physician ROI Ledger */}
              <div style={{ background: 'white', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' }}>
                 <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '25px' }}>Physician Referral ROI Ledger</div>
                 <div style={{ overflowX: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                       <thead>
                          <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                             {['Physician', 'Billed Vol.', 'Commission', 'Yield ROI'].map((th, i) => (
                                <th key={th} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: '9px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase' }}>{th}</th>
                             ))}
                          </tr>
                       </thead>
                       <tbody>
                          {physicianRoi.map((doc, idx) => (
                             <tr key={doc.doctorName || idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '12px', fontSize: '12px', fontWeight: 900, color: '#1e293b' }}>{doc.doctorName}</td>
                                <td style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 850, color: '#1e293b' }}>₹{(doc.billedRevenue || 0).toLocaleString()}</td>
                                <td style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 850, color: '#dc2626' }}>₹{(doc.commissionPaid || 0).toLocaleString()}</td>
                                <td style={{ padding: '12px', textAlign: 'right' }}>
                                   <span style={{ 
                                      fontSize: '10px', 
                                      fontWeight: 950, 
                                      padding: '4px 8px', 
                                      borderRadius: '6px', 
                                      background: doc.roiMultiplier > 5 ? '#eff6ff' : '#f8fafc',
                                      color: doc.roiMultiplier > 5 ? '#2563eb' : '#64748b',
                                      border: doc.roiMultiplier > 5 ? '1px solid #bfdbfe' : '1px solid #e2e8f0'
                                   }}>
                                      {doc.roiMultiplier}x Yield
                                   </span>
                                </td>
                             </tr>
                          ))}
                          {physicianRoi.length === 0 && (
                             <tr>
                                <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No ROI records compiled.</td>
                             </tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              </div>

              {/* Discount Concession Leakage Auditor */}
              <div style={{ background: 'white', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' }}>
                 <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '25px' }}>Discount & Concession Leakage Auditor</div>
                 <div style={{ overflowX: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                       <thead>
                          <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                             {['Authorized By', 'Discounts', 'Billed gross', 'Avg %', 'Risk profile'].map((th, i) => (
                                <th key={th} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: '9px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase' }}>{th}</th>
                             ))}
                          </tr>
                       </thead>
                       <tbody>
                          {leakage.map((leak, idx) => (
                             <tr key={leak.doctorName || idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '12px', fontSize: '12px', fontWeight: 900, color: '#1e293b' }}>{leak.doctorName}</td>
                                <td style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 850, color: '#ea580c' }}>₹{(leak.totalDiscountApproved || 0).toLocaleString()}</td>
                                <td style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 850, color: '#1e293b' }}>₹{(leak.totalBilledRevenue || 0).toLocaleString()}</td>
                                <td style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{leak.averageDiscountPercentage}%</td>
                                <td style={{ padding: '12px', textAlign: 'right' }}>
                                   <span style={{ 
                                      fontSize: '9px', 
                                      fontWeight: 950, 
                                      padding: '3px 6px', 
                                      borderRadius: '6px', 
                                      background: leak.riskLevel === 'HIGH RISK' ? '#fef2f2' : leak.riskLevel === 'REVIEW' ? '#fff7ed' : '#f0fdf4',
                                      color: leak.riskLevel === 'HIGH RISK' ? '#dc2626' : leak.riskLevel === 'REVIEW' ? '#ea580c' : '#16a34a',
                                      border: leak.riskLevel === 'HIGH RISK' ? '1px solid #fecaca' : leak.riskLevel === 'REVIEW' ? '1px solid #ffedd5' : '1px solid #bbf7d0'
                                   }}>
                                      {leak.riskLevel}
                                   </span>
                                </td>
                             </tr>
                          ))}
                          {leakage.length === 0 && (
                             <tr>
                                <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No concession audit trail active.</td>
                             </tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              </div>

            </div>

          </div>
        );
      })()}

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
      {showAutoBillConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div 
            onClick={() => setShowAutoBillConfirm(false)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.3s'
            }}
          />
          <div style={{
            position: 'relative',
            zIndex: 10,
            background: 'white',
            borderRadius: '24px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            padding: '32px',
            width: isMobile ? '90%' : '440px',
            maxWidth: '100%',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '20px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: billingSettings.autoBill ? '#fff7ed' : '#eff6ff',
                color: billingSettings.autoBill ? '#ea580c' : '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px'
              }}>
                {billingSettings.autoBill ? '⚠️' : 'ℹ️'}
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#1e293b', margin: 0 }}>
                  {billingSettings.autoBill ? 'Disable Auto-Billing?' : 'Enable Auto-Billing?'}
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '10px', lineHeight: '1.5', fontWeight: 500 }}>
                  {billingSettings.autoBill 
                    ? 'Are you sure you want to disable auto-billing? Invoices will no longer be generated automatically when appointments are completed.' 
                    : 'Are you sure you want to enable auto-billing? Invoices will be generated automatically when appointments are completed.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAutoBillConfirm(false)}
                  style={{
                    flex: 1,
                    padding: '12px 18px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 950,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleToggleAutoBill();
                    setShowAutoBillConfirm(false);
                  }}
                  style={{
                    flex: 1,
                    padding: '12px 18px',
                    borderRadius: '12px',
                    border: 'none',
                    background: billingSettings.autoBill ? '#ea580c' : '#1d4ed8',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 950,
                    cursor: 'pointer',
                    boxShadow: billingSettings.autoBill ? '0 4px 12px rgba(234,88,12,0.2)' : '0 4px 12px rgba(29,78,216,0.2)',
                    transition: 'all 0.2s'
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceManager;
