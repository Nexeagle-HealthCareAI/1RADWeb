import React from 'react';

const ReferralHub = ({
  filteredReferralCuts,
  paginatedReferralCuts,
  timeFilter,
  setTimeFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  handleToggleCommissionStatus,
  handleDeleteExpense,
  setEditPayout,
  setIsPayoutDrawerOpen,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  sortConfig,
  handleSort
}) => {
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'ASC' ? '↑' : '↓';
  };

  return (
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
                   <th onClick={() => handleSort('date')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PAYOUT_DATE {getSortIcon('date')}</th>
                   <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PARTNER (REFERRER) {getSortIcon('name')}</th>
                   <th onClick={() => handleSort('description')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>DESCRIPTION / MISSION {getSortIcon('description')}</th>
                   <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>REF_ID</th>
                   <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PAYOUT_AMOUNT {getSortIcon('amount')}</th>
                   <th style={{ padding: '20px 30px', textAlign: 'center', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>STATUS</th>
                   <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>ACTION</th>
                </tr>
             </thead>
             <tbody>
                {filteredReferralCuts.length === 0 ? (
                   <tr><td colSpan="7" style={{ padding: '100px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO REFERRAL PAYOUTS DETECTED</td></tr>
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
  );
};

export default ReferralHub;
