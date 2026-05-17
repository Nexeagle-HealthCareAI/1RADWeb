import React from 'react';

const ExpenseLedger = ({
  isMobile,
  outflowStats,
  filteredOutflow,
  paginatedOutflow,
  globalOutflow,
  timeFilter,
  setTimeFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  handleDeleteExpense,
  setEditExpense,
  setIsExpenseDrawerOpen,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  TODAY,
  sortConfig,
  handleSort,
  handleToggleExpenseStatus
}) => {
  const getSortIcon = (key) => {

    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'ASC' ? '↑' : '↓';
  };

  return (
    <div className="expenses-main" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px', animation: 'fadeIn 0.3s' }}>
        <div style={{ background: 'white', borderRadius: isMobile ? '16px' : '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row', 
            justifyContent: 'space-between', 
            alignItems: isMobile ? 'stretch' : 'center', 
            padding: isMobile ? '20px' : '20px 30px', 
            background: '#f8fafc', 
            borderBottom: '1px solid #f1f5f9',
            gap: isMobile ? '20px' : '0'
          }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '15px' : '20px' }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '8px' : '15px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>TEMPORAL_SCOPE:</span>
                <div style={{ 
                  display: 'flex', 
                  background: '#f1f5f9', 
                  padding: '3px', 
                  borderRadius: '10px', 
                  border: '1px solid #e2e8f0',
                  overflowX: 'auto',
                  width: isMobile ? '100%' : 'auto'
                }}>
                  {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
                    <button 
                      key={t}
                      onClick={() => setTimeFilter(t)}
                      style={{ 
                        padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: timeFilter === t ? '#dc2626' : 'transparent',
                        color: timeFilter === t ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s',
                        flex: isMobile ? 1 : 'none',
                        whiteSpace: 'nowrap'
                      }}
                    >{t}</button>
                  ))}
                </div>
              </div>

              {timeFilter === 'CUSTOM' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.2s', width: isMobile ? '100%' : 'auto' }}>
                  <input 
                    type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 700 }}
                  />
                  <input 
                    type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 700 }}
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
              style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', background: '#dc2626', color: 'white', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}
            >+ LOG EXPENSE</button>
          </div>
        </div>

       {/* KPI MATRIX */}

       <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)', gap: isMobile ? '15px' : '20px' }}>

          <div className="kpi-card" style={{ background: '#fff1f2', padding: '20px', borderRadius: '24px', border: '1px solid #fecdd3', boxShadow: '0 4px 20px rgba(225,29,72,0.05)' }}>
            <p style={{ fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', marginBottom: '10px' }}>TOTAL EXPENDITURE</p>
            <div style={{ fontSize: isMobile ? '24px' : '22px', fontWeight: 950, color: '#881337' }}>₹{outflowStats.totalOutflow.toLocaleString()}</div>
          </div>
          <div className="kpi-card" style={{ background: 'white', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
            <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '10px' }}>OPERATIONAL COST</p>
            <div style={{ fontSize: isMobile ? '24px' : '22px', fontWeight: 950, color: '#1e293b' }}>₹{outflowStats.operationalTotal.toLocaleString()}</div>
          </div>
          <div className="kpi-card" style={{ background: 'white', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
            <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '10px' }}>STRATEGIC PAYOUTS</p>
            <div style={{ fontSize: isMobile ? '24px' : '22px', fontWeight: 950, color: '#e11d48' }}>₹{outflowStats.referralTotal.toLocaleString()}</div>
          </div>
          <div className="kpi-card" style={{ background: '#f8fafc', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
            <p style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', marginBottom: '10px' }}>TODAY'S BURN</p>
            <div style={{ fontSize: isMobile ? '24px' : '22px', fontWeight: 950, color: '#0f172a' }}>₹{outflowStats.todayOutflow.toLocaleString()}</div>
          </div>

          <div className="kpi-card" style={{ background: 'white', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
             <h3 style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1.5px', marginBottom: '12px' }}>DISTRIBUTION</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '60px', overflowY: 'auto', paddingRight: '5px' }}>
                {outflowStats.categoryBreakdown.map(cat => (
                   <div key={cat.category} style={{ marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                         <span style={{ fontSize: '8px', fontWeight: 900, color: '#64748b' }}>{cat.category.toUpperCase()}</span>
                         <span style={{ fontSize: '9px', fontWeight: 950, color: '#1e293b' }}>₹{cat.amount.toLocaleString()}</span>
                      </div>
                   </div>
                ))}
             </div>
          </div>
       </div>


       <div style={{ background: 'white', borderRadius: isMobile ? '16px' : '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
          <div style={{ overflowX: 'auto' }}>
             <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '1000px' : 'auto' }}>

                <thead style={{ background: '#f8fafc' }}>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <th onClick={() => handleSort('date')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>DATE {getSortIcon('date')}</th>
                    <th onClick={() => handleSort('description')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>DESCRIPTION {getSortIcon('description')}</th>
                    <th onClick={() => handleSort('category')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>CATEGORY {getSortIcon('category')}</th>
                    <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>AMOUNT {getSortIcon('amount')}</th>
                    <th style={{ padding: '20px 30px', textAlign: 'center', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>STATUS</th>
                    <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {(paginatedOutflow || []).map(exp => (
                    <tr key={exp.id} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                      <td style={{ padding: '20px 30px', fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>{exp.date ? new Date(exp.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</td>
                      <td style={{ padding: '20px 30px' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 850, color: '#1e293b' }}>{exp.description}</div>
                        <div style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8' }}>{(exp.name || 'N/A').toUpperCase()}</div>
                      </td>
                      <td style={{ padding: '20px 30px' }}>
                        <span style={{ 
                          fontSize: '9px', fontWeight: 950, color: 'white', 
                          background: exp.category === 'Referral' ? '#e11d48' : '#dc2626', 
                          padding: '5px 12px', borderRadius: '8px' 
                        }}>{(exp.category || 'General').toUpperCase()}</span>
                      </td>
                      <td style={{ padding: '20px 30px', textAlign: 'right', fontSize: '12px', fontWeight: 950, color: '#dc2626' }}>₹{(Number(exp.amount) || 0).toLocaleString()}</td>
                      <td style={{ padding: '20px 30px', textAlign: 'center' }}>
                         {exp.type === 'OPERATIONAL' || exp.type === 'LEGACY' ? (
                           <button 
                             onClick={() => handleToggleExpenseStatus(exp.id, exp.status)}
                             style={{ 
                               padding: '6px 12px', borderRadius: '10px', border: 'none', 
                               background: exp.status === 'PAID' ? '#dcfce7' : '#fee2e2',
                               color: exp.status === 'PAID' ? '#166534' : '#991b1b',
                               fontSize: '8.5px', fontWeight: 950, cursor: 'pointer', transition: 'all 0.2s'
                             }}
                           >{(exp.status || 'UNPAID').toUpperCase()}</button>
                         ) : (
                           <span style={{ fontSize: '8.5px', fontWeight: 950, color: '#10b981' }}>PAID</span>
                         )}
                      </td>
                       <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                          {exp.type === 'OPERATIONAL' || exp.type === 'LEGACY' ? (
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                               <button 
                                 onClick={() => {
                                   setEditExpense({ 
                                     id: exp.id,
                                     description: exp.description,
                                     category: exp.category,
                                     amount: exp.amount,
                                     transactionDate: exp.date,
                                     vendorName: exp.name,
                                     status: exp.status
                                   });
                                   setIsExpenseDrawerOpen(true);
                                 }}
                                 style={{ padding: '6px 12px', borderRadius: '10px', border: 'none', background: '#f0f4ff', color: '#0f52ba', fontSize: '8.5px', fontWeight: 950, cursor: 'pointer' }}
                               >EDIT</button>
                               <button 
                                 onClick={() => handleDeleteExpense(exp.id)}
                                 style={{ padding: '6px 12px', borderRadius: '10px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '8.5px', fontWeight: 950, cursor: 'pointer' }}
                               >DELETE</button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '8.5px', fontWeight: 950, color: '#94a3b8' }}>LOCKED (STRATEGIC)</span>
                          )}
                       </td>

                    </tr>
                  ))}
                  {(filteredOutflow || []).length === 0 && (
                    <tr><td colSpan="6" style={{ padding: '50px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>No expenditure records found.</td></tr>
                  )}

                </tbody>
             </table>
          </div>
          <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center', gap: '5px' }}>
            {Array.from({ length: Math.ceil(filteredOutflow.length / itemsPerPage) }).map((_, i) => (
              <button key={i} onClick={() => setCurrentPage(i + 1)} style={{ padding: '6px 12px', background: currentPage === i + 1 ? '#dc2626' : '#f1f5f9', color: currentPage === i + 1 ? 'white' : '#64748b', border: 'none', borderRadius: '8px', fontSize: '10px', fontWeight: 950, cursor: 'pointer', transition: 'all 0.2s' }}>{i + 1}</button>
            ))}
          </div>
       </div>
    </div>
  );
};


export default ExpenseLedger;
