import React, { useState, useEffect, useMemo } from 'react';

const ReferralHub = ({
  isMobile,
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
  handleSort,
  referrers,
  referrerFilter,
  setReferrerFilter,
  modalityFilter,
  setModalityFilter
}) => {
  const referralStats = useMemo(() => {
    const cuts = filteredReferralCuts || [];
    return {
      total: cuts.reduce((sum, c) => sum + (Number(c?.amount) || 0), 0),
      paid: cuts.filter(c => c.status === 'PAID').reduce((sum, c) => sum + (Number(c?.amount) || 0), 0),
      unpaid: cuts.filter(c => c.status !== 'PAID').reduce((sum, c) => sum + (Number(c?.amount) || 0), 0),
      count: cuts.length
    };
  }, [filteredReferralCuts]);

  const [selectedIds, setSelectedIds] = useState(new Set());

  // Clear selections on filter adjustments
  useEffect(() => {
    setSelectedIds(new Set());
  }, [timeFilter, startDate, endDate, referrerFilter, modalityFilter]);

  const toggleSelectRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const visibleRows = useMemo(() => {
    return paginatedReferralCuts || [];
  }, [paginatedReferralCuts]);

  const isAllVisibleSelected = useMemo(() => {
    if (visibleRows.length === 0) return false;
    return visibleRows.every(row => selectedIds.has(row.id));
  }, [visibleRows, selectedIds]);

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleRows.forEach(row => next.delete(row.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleRows.forEach(row => next.add(row.id));
        return next;
      });
    }
  };

  const handleExportToExcel = () => {
    const isExportingSelected = selectedIds.size > 0;
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `1RAD_Referral_Payouts_${timeFilter}_${isExportingSelected ? 'Selected' : 'All'}_${timestampStr}`;

    const headers = [
      'Payout Date',
      'Partner Name',
      'Patient Name',
      'Modality',
      'Reference ID',
      'Payout Amount (INR)',
      'Status'
    ];

    const cutsToExport = filteredReferralCuts || [];
    const filteredCuts = isExportingSelected
      ? cutsToExport.filter(cut => selectedIds.has(cut.id))
      : cutsToExport;

    const rows = filteredCuts.map(cut => [
      formatDate(cut?.date, true),
      cut?.name || 'DIRECT',
      cut?.patientName || 'N/A',
      cut?.modality || 'MRI',
      cut?.reference || 'N/A',
      Number(cut?.amount) || 0,
      cut?.status || 'UNPAID'
    ]);

    const escapeCsvCell = (cell) => {
      if (cell === null || cell === undefined) return '';
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    };

    const csvContent = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map(row => row.map(escapeCsvCell).join(','))
    ].join('\n');

    // Excel compatibility UTF-8 BOM
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateStr, isUtc = false) => {
    if (!dateStr) return 'N/A';
    
    let parsedStr = dateStr;
    if (isUtc && typeof dateStr === 'string' && dateStr.includes('T') && !dateStr.endsWith('Z') && !dateStr.includes('+') && !/-\d{2}:\d{2}$/.test(dateStr)) {
      parsedStr = `${dateStr}Z`;
    }

    const date = new Date(parsedStr);
    if (isNaN(date.getTime())) return dateStr;

    let day, month, year;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const parts = formatter.formatToParts(date);
      day = parts.find(p => p.type === 'day').value;
      month = parts.find(p => p.type === 'month').value;
      year = parts.find(p => p.type === 'year').value;
    } catch (err) {
      day = date.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      month = months[date.getMonth()];
      year = date.getFullYear();
    }

    const dateStrStr = String(dateStr);
    const hasTime = dateStrStr.includes('T') || dateStrStr.includes(':') || dateStrStr.includes(' ');
    
    if (!hasTime) {
      return `${day} ${month.toUpperCase()}, ${year}`;
    }

    try {
      const timeStr = date.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `${day} ${month.toUpperCase()}, ${year} - ${timeStr} IST`;
    } catch (e) {
      return `${day} ${month.toUpperCase()}, ${year}`;
    }
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'ASC' ? '↑' : '↓';
  };

  return (
    <div className="referral-cuts-main" style={{ animation: 'fadeIn 0.3s' }}>
       <div style={{ 
         display: 'flex', 
         flexDirection: isMobile ? 'column' : 'row', 
         justifyContent: 'space-between', 
         alignItems: isMobile ? 'stretch' : 'center', 
         gap: isMobile ? '20px' : '0',
         marginBottom: '35px' 
       }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                 <h3 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 950, color: '#1e293b', letterSpacing: '-0.5px' }}>REFERRAL PAYOUT COMMAND</h3>
                 <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>Real-time partner clinical concessions.</p>
              </div>

              <button
                onClick={handleExportToExcel}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '9px',
                  fontWeight: 950,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.25)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.15)';
                }}
              >
                <span>{selectedIds.size > 0 ? `📥 EXPORT SELECTED (${selectedIds.size})` : '📥 EXPORT ALL'}</span>
              </button>
           </div>
          
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '15px' : '20px' }}>
             <div style={{ position: 'relative' }}>
                <label style={{ position: 'absolute', top: '-15px', left: '0', fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PARTNER_IDENTITY</label>
                <select 
                  value={referrerFilter} 
                  onChange={e => setReferrerFilter(e.target.value)}
                  style={{ 
                    padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 800, 
                    background: 'white', color: '#1e293b', width: '100%', minWidth: isMobile ? '0' : '180px', outline: 'none' 
                  }}
                >
                  <option value="ALL">ALL PARTNERS (GLOBAL)</option>
                  {(referrers || []).map(ref => (
                    <option key={ref.referrerId} value={ref.referrerId}>{ref.name?.toUpperCase()}</option>
                  ))}
                </select>
             </div>

             <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>MODALITY:</span>
                <div style={{ display: 'flex', background: 'white', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0', width: isMobile ? '100%' : 'auto' }}>
                   {['ALL', 'MRI', 'CT', 'X-RAY', 'USG'].map(m => (
                     <button 
                      key={m}
                      onClick={() => setModalityFilter(m)}
                      style={{ 
                        padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: modalityFilter === m ? '#e11d48' : 'transparent',
                        color: modalityFilter === m ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s',
                        flex: isMobile ? 1 : 'none'
                      }}
                     >{m}</button>
                   ))}
                </div>
             </div>

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
                      background: timeFilter === t ? '#e11d48' : 'transparent',
                      color: timeFilter === t ? 'white' : '#64748b',
                      cursor: 'pointer', transition: 'all 0.2s',
                      flex: isMobile ? 1 : 'none',
                      whiteSpace: 'nowrap'
                    }}
                  >{t}</button>
                ))}
             </div>

             {timeFilter === 'CUSTOM' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.2s', width: isMobile ? '100%' : 'auto' }}>
                 <input 
                   type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                   style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                 />
                 <input 
                   type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                   style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                 />
              </div>
             )}
          </div>
       </div>

       <div className="referral-kpi-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? '15px' : '25px', marginBottom: '40px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
             <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px' }}>STRATEGIC_OUTFLOW</div>
             <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: 950, color: '#1e293b' }}>₹{referralStats.total.toLocaleString()}</div>
          </div>
          
          <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '24px', border: '1px solid #dcfce7', boxShadow: '0 4px 20px rgba(22,101,52,0.05)' }}>
             <div style={{ fontSize: '10px', fontWeight: 950, color: '#166534', letterSpacing: '1px', marginBottom: '8px' }}>SETTLED_DISBURSEMENTS</div>
             <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: 950, color: '#14532d' }}>₹{referralStats.paid.toLocaleString()}</div>
          </div>

          <div style={{ background: '#fff1f2', padding: '20px', borderRadius: '24px', border: '1px solid #fecdd3', boxShadow: '0 4px 20px rgba(225,29,72,0.05)' }}>
             <div style={{ fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', marginBottom: '8px' }}>OUTSTANDING_OBLIGATIONS</div>
             <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: 950, color: '#881337' }}>₹{referralStats.unpaid.toLocaleString()}</div>
          </div>
       </div>

       <div style={{ background: 'white', borderRadius: isMobile ? '16px' : '24px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '1000px' : 'auto' }}>
               <thead style={{ background: '#fff1f2' }}>
                  <tr>
                     <th style={{ padding: '20px 30px', width: '40px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={isAllVisibleSelected} 
                          onChange={toggleSelectAllVisible}
                          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#e11d48', borderRadius: '4px' }}
                        />
                     </th>
                     <th onClick={() => handleSort('date')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PAYOUT_DATE {getSortIcon('date')}</th>
                     <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PARTNER {getSortIcon('name')}</th>
                     <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PATIENT</th>
                     <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>STUDY</th>
                     <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>REF_ID</th>
                     <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer', padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PAYOUT_AMOUNT {getSortIcon('amount')}</th>
                     <th style={{ padding: '20px 30px', textAlign: 'center', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>STATUS</th>
                     <th style={{ padding: '20px 30px', textAlign: 'center', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PMT_RECV</th>
                     <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>ACTION</th>
                  </tr>
               </thead>
             <tbody>
                {filteredReferralCuts.length === 0 ? (
                   <tr><td colSpan="10" style={{ padding: '100px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO REFERRAL PAYOUTS DETECTED</td></tr>
                ) : (
                   paginatedReferralCuts.map(cut => (
                      <tr key={cut?.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                         <td style={{ padding: '20px 30px', textAlign: 'center' }}>
                             <input 
                               type="checkbox" 
                               checked={selectedIds.has(cut?.id)} 
                               onChange={() => toggleSelectRow(cut?.id)}
                               style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: '#e11d48' }}
                             />
                          </td>
                         <td style={{ padding: '20px 30px', fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>{formatDate(cut?.date, true)}</td>
                         <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '11.5px', fontWeight: 950, color: '#e11d48' }}>{(cut?.name || 'DIRECT').toUpperCase()}</div>
                         </td>
                         <td style={{ padding: '20px 30px', fontSize: '11.5px', fontWeight: 850, color: '#1e293b' }}>{(cut?.patientName || 'N/A').toUpperCase()}</td>
                         <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '9.5px', fontWeight: 950, color: '#0f52ba' }}>{(cut?.modality || 'MRI').toUpperCase()}</div>
                            {cut?.description && <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '2px' }}>{cut.description}</div>}
                         </td>
                         <td style={{ padding: '20px 30px' }}>
                            <div style={{ padding: '4px 8px', background: '#f1f5f9', borderRadius: '6px', fontSize: '9px', fontWeight: 950, color: '#1e293b', display: 'inline-block', fontFamily: 'monospace' }}>{cut?.reference || 'N/A'}</div>
                         </td>
                         <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', fontWeight: 950, color: '#e11d48' }}>₹{(Number(cut?.amount) || 0).toLocaleString()}</div>
                         </td>
                         <td style={{ padding: '20px 30px', textAlign: 'center' }}>
                            <button 
                              onClick={() => cut?.type === 'STRATEGIC' && handleToggleCommissionStatus(cut?.id, cut?.status)}
                              disabled={cut?.type === 'LEGACY'}
                              style={{ 
                                padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '8.5px', fontWeight: 950,
                                background: cut?.status === 'PAID' ? '#dcfce7' : '#fee2e2',
                                color: cut?.status === 'PAID' ? '#166534' : '#991b1b',
                                cursor: cut?.type === 'STRATEGIC' ? 'pointer' : 'default',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                              }}
                            >
                              {cut?.status || 'UNPAID'}
                            </button>
                         </td>
                         <td style={{ padding: '20px 30px', textAlign: 'center' }}>
                             {cut?.patientPaymentStatus === 'PAID' ? (
                               <span title="Patient has paid" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: '#dcfce7', fontSize: '14px' }}>✓</span>
                             ) : cut?.patientPaymentStatus === 'PARTIAL' ? (
                               <span title="Partial payment received" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: '#fef3c7', fontSize: '11px', fontWeight: 950, color: '#92400e' }}>½</span>
                             ) : cut?.patientPaymentStatus === 'PENDING' ? (
                               <span title="Payment pending" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: '#fee2e2', fontSize: '14px' }}>✗</span>
                             ) : (
                               <span title="Status unknown" style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>—</span>
                             )}
                         </td>
                         <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                             {cut.type === 'LEGACY' ? (
                                <button 
                                   onClick={() => handleDeleteExpense(cut.id)}
                                   style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '8.5px', fontWeight: 950, cursor: 'pointer' }}
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
                                           modality: cut.modality || 'MRI',
                                           remarks: (cut.description || '').includes(' - ') ? cut.description.split(' - ')[1] : '',
                                           invoiceId: cut.reference,
                                           status: cut.status
                                         });
                                         setIsPayoutDrawerOpen(true);
                                      }}
                                      style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#f0f4ff', color: '#0f52ba', fontSize: '8.5px', fontWeight: 950, cursor: 'pointer' }}
                                   >UPDATE PAYOUT</button>
                                   <span style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>LOCKED</span>
                                </div>
                             )}
                         </td>
                      </tr>
                   ))
                )}
             </tbody>
          </table>
        </div>
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
