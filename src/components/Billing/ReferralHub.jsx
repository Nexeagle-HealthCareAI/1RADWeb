import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';

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
  referralSearch = '',
  setReferralSearch = () => {},
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
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    cutId: null,
    currentStatus: '',
    patientName: '',
    amount: 0
  });

  // Per-partner drill-down state
  const [activePartnerId, setActivePartnerId] = useState(null);
  const [drawerSelectedIds, setDrawerSelectedIds] = useState(new Set());
  const [bulkConfirmModal, setBulkConfirmModal] = useState({
    isOpen: false,
    count: 0,
    total: 0,
    eligibleIds: [],
    partnerName: ''
  });

  // Clear selections on filter adjustments
  useEffect(() => {
    setSelectedIds(new Set());
  }, [timeFilter, startDate, endDate, referrerFilter, modalityFilter, referralSearch]);

  // Reset drawer selection whenever the active partner changes
  useEffect(() => {
    setDrawerSelectedIds(new Set());
  }, [activePartnerId]);

  // Group filtered cuts by partner, with aggregates. Sorted: outstanding DESC,
  // then total DESC; "DIRECT" (no referrer) pinned to the bottom.
  const partnerGroups = useMemo(() => {
    const groups = new Map();
    (filteredReferralCuts || []).forEach(cut => {
      const key = cut?.referrerId || (cut?.name ? cut.name.toUpperCase() : '__DIRECT__');
      const displayName = (cut?.name || 'DIRECT').toUpperCase();
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          name: displayName,
          isDirect: !cut?.referrerId && !cut?.name,
          cuts: [],
          total: 0,
          paid: 0,
          unpaid: 0,
          count: 0,
          lastDate: 0,
        });
      }
      const g = groups.get(key);
      g.cuts.push(cut);
      g.count += 1;
      const amt = Number(cut?.amount) || 0;
      g.total += amt;
      if (cut?.status === 'PAID') g.paid += amt; else g.unpaid += amt;
      const cutDate = cut?.date ? new Date(cut.date).getTime() : 0;
      if (cutDate > g.lastDate) g.lastDate = cutDate;
    });
    return Array.from(groups.values()).sort((a, b) => {
      if (a.isDirect !== b.isDirect) return a.isDirect ? 1 : -1;
      if (b.unpaid !== a.unpaid) return b.unpaid - a.unpaid;
      return b.total - a.total;
    });
  }, [filteredReferralCuts]);

  const activePartner = useMemo(
    () => partnerGroups.find(g => g.id === activePartnerId) || null,
    [partnerGroups, activePartnerId]
  );

  const closeDrawer = () => {
    setActivePartnerId(null);
    setDrawerSelectedIds(new Set());
  };

  const toggleDrawerSelectRow = (id) => {
    setDrawerSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Only cuts that are genuinely eligible for bulk mark-as-paid drive "Select All".
  // Criteria must mirror openBulkPaidConfirm exactly so count/total in the popup
  // always match what the user selected.
  const selectableDrawerCuts = activePartner
    ? activePartner.cuts.filter(c =>
        c.type === 'STRATEGIC' && c.status !== 'PAID' && c.patientPaymentStatus === 'PAID'
      )
    : [];

  const isAllDrawerSelected = selectableDrawerCuts.length > 0 &&
    selectableDrawerCuts.every(c => drawerSelectedIds.has(c.id));

  const toggleSelectAllInDrawer = () => {
    if (!activePartner) return;
    if (isAllDrawerSelected) {
      setDrawerSelectedIds(new Set());
    } else {
      setDrawerSelectedIds(new Set(selectableDrawerCuts.map(c => c.id)));
    }
  };

  // "Mark selected as PAID" — only strategic + currently unpaid + patient payment received cuts are eligible.
  const openBulkPaidConfirm = () => {
    if (!activePartner) return;
    const eligible = activePartner.cuts.filter(c =>
      drawerSelectedIds.has(c.id) && c.type === 'STRATEGIC' && c.status !== 'PAID' && c.patientPaymentStatus === 'PAID'
    );
    const total = eligible.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    setBulkConfirmModal({
      isOpen: true,
      count: eligible.length,
      total,
      eligibleIds: eligible.map(c => c.id),
      partnerName: activePartner.name
    });
  };

  const handleBulkMarkPaid = () => {
    // handleToggleCommissionStatus toggles based on the *current* status, so we
    // pass 'UNPAID' to flip these into PAID.
    bulkConfirmModal.eligibleIds.forEach(id => {
      handleToggleCommissionStatus(id, 'UNPAID');
    });
    setBulkConfirmModal({ isOpen: false, count: 0, total: 0, eligibleIds: [], partnerName: '' });
    setDrawerSelectedIds(new Set());
  };

  const handleBulkExport = () => {
    if (!activePartner) return;
    const selectedCuts = activePartner.cuts.filter(c => drawerSelectedIds.has(c.id));
    if (selectedCuts.length === 0) return;

    const rows = selectedCuts.map(cut => ({
      'Payout Date': formatDate(cut?.date, true),
      'Patient ID': cut?.patientId || '',
      'Patient Name': (cut?.patientName || 'N/A').toUpperCase(),
      'Age': cut?.patientAge || '',
      'Gender': cut?.patientGender || '',
      'Mobile': cut?.mobile || cut?.patientMobile || '',
      'Modality': (cut?.modality || '').toUpperCase(),
      'Reference ID': cut?.reference || '',
      'Payout Amount (INR)': Number(cut?.amount) || 0,
      'Patient Payment': cut?.patientPaymentStatus || '',
      'Commission Status': cut?.status || 'UNPAID',
      'Commission Type': cut?.type || '',
      'Remarks': cut?.description ? (cut.description.includes(' - ') ? cut.description.split(' - ')[1] : cut.description) : '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 28 }, { wch: 14 }, { wch: 26 }, { wch: 6 }, { wch: 10 }, { wch: 16 },
      { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 28 }
    ];
    const wb = XLSX.utils.book_new();
    const sheetName = activePartner.name.slice(0, 31).replace(/[:\\/?*\[\]]/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const dateStr = new Date().toISOString().split('T')[0];
    const safeName = activePartner.name.replace(/[^A-Z0-9]+/gi, '_');
    XLSX.writeFile(wb, `1RAD_Partner_${safeName}_${dateStr}.xlsx`);
  };

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
    if (!partnerGroups.length) return;
    const wb = XLSX.utils.book_new();

    // ── Summary sheet ────────────────────────────────────────────────────
    const summaryRows = partnerGroups.map(g => ({
      'Partner': g.name,
      'Total Payouts': g.count,
      'Total Amount (INR)': g.total,
      'Settled (INR)': g.paid,
      'Outstanding (INR)': g.unpaid,
    }));
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 28 }, { wch: 15 }, { wch: 20 }, { wch: 16 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // ── One sheet per partner ────────────────────────────────────────────
    partnerGroups.forEach(group => {
      const rows = group.cuts.map(cut => ({
        'Payout Date': formatDate(cut?.date, true),
        'Patient ID': cut?.patientId || '',
        'Patient Name': (cut?.patientName || 'N/A').toUpperCase(),
        'Age': cut?.patientAge || '',
        'Gender': cut?.patientGender || '',
        'Mobile': cut?.mobile || cut?.patientMobile || '',
        'Modality': (cut?.modality || '').toUpperCase(),
        'Reference ID': cut?.reference || '',
        'Payout Amount (INR)': Number(cut?.amount) || 0,
        'Patient Payment': cut?.patientPaymentStatus || '',
        'Commission Status': cut?.status || 'UNPAID',
        'Commission Type': cut?.type || '',
        'Remarks': cut?.description ? (cut.description.includes(' - ') ? cut.description.split(' - ')[1] : cut.description) : '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 28 }, { wch: 14 }, { wch: 26 }, { wch: 6 }, { wch: 10 }, { wch: 16 },
        { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 28 }
      ];
      const sheetName = group.name.slice(0, 31).replace(/[:\\/?*\[\]]/g, '_');
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `1RAD_Referral_Payouts_${timeFilter}_${dateStr}.xlsx`);
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
                <span>📥 EXPORT EXCEL ({partnerGroups.length} PARTNER{partnerGroups.length !== 1 ? 'S' : ''})</span>
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
          {/* Partner-grid search header */}
          <div style={{ padding: isMobile ? '15px' : '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: '12px', background: '#fff5f6' }}>
            <div style={{ position: 'relative', width: isMobile ? '100%' : '380px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
              <input
                type="text"
                value={referralSearch || ''}
                onChange={e => setReferralSearch(e.target.value)}
                placeholder="Search by patient, partner, modality, or ref ID..."
                style={{
                  width: '100%',
                  padding: '10px 36px 10px 36px',
                  borderRadius: '10px',
                  border: '1px solid #fecdd3',
                  fontSize: '12px',
                  fontWeight: 600,
                  outline: 'none',
                  background: 'white',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => { e.target.style.borderColor = '#e11d48'; e.target.style.boxShadow = '0 0 0 3px rgba(225, 29, 72, 0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#fecdd3'; e.target.style.boxShadow = 'none'; }}
              />
              {referralSearch && (
                <button
                  type="button"
                  onClick={() => setReferralSearch('')}
                  aria-label="Clear search"
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: 0, lineHeight: 1 }}
                >×</button>
              )}
            </div>
            <span style={{ fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
              {partnerGroups.length} {partnerGroups.length === 1 ? 'PARTNER' : 'PARTNERS'} · {filteredReferralCuts.length} {filteredReferralCuts.length === 1 ? 'PAYOUT' : 'PAYOUTS'}
            </span>
          </div>

          {/* Partner card grid */}
          <div style={{ padding: isMobile ? '15px' : '24px' }}>
            {partnerGroups.length === 0 ? (
              <div style={{ padding: '80px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO REFERRAL PAYOUTS DETECTED</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {partnerGroups.map(group => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActivePartnerId(group.id)}
                    style={{
                      textAlign: 'left',
                      padding: '20px',
                      borderRadius: '18px',
                      border: group.unpaid > 0 ? '1px solid #fecdd3' : '1px solid #e2e8f0',
                      background: group.unpaid > 0 ? 'linear-gradient(135deg, #fff5f6 0%, white 70%)' : 'white',
                      cursor: 'pointer',
                      transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = group.unpaid > 0
                        ? '0 10px 24px rgba(225,29,72,0.12)'
                        : '0 10px 24px rgba(15,82,186,0.08)';
                      e.currentTarget.style.borderColor = group.unpaid > 0 ? '#e11d48' : '#0f52ba';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)';
                      e.currentTarget.style.borderColor = group.unpaid > 0 ? '#fecdd3' : '#e2e8f0';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 950, color: '#1e293b', letterSpacing: '0.5px', lineHeight: 1.3, wordBreak: 'break-word' }}>
                        {group.name}
                      </div>
                      {group.unpaid > 0 && (
                        <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#fee2e2', color: '#991b1b', fontSize: '8.5px', fontWeight: 950, letterSpacing: '0.5px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          OUTSTANDING
                        </span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '4px' }}>TOTAL PAYOUTS</div>
                      <div style={{ fontSize: '22px', fontWeight: 950, color: '#1e293b' }}>₹{group.total.toLocaleString()}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#166534', letterSpacing: '0.5px' }}>SETTLED</div>
                        <div style={{ fontSize: '12px', fontWeight: 950, color: '#14532d', marginTop: '2px' }}>₹{group.paid.toLocaleString()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#991b1b', letterSpacing: '0.5px' }}>UNPAID</div>
                        <div style={{ fontSize: '12px', fontWeight: 950, color: group.unpaid > 0 ? '#e11d48' : '#cbd5e1', marginTop: '2px' }}>₹{group.unpaid.toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '10px', fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>
                      <span>{group.count} payout{group.count !== 1 ? 's' : ''}</span>
                      <span style={{ color: '#e11d48', fontWeight: 950, letterSpacing: '0.5px' }}>VIEW →</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
      </div>

      {/* ── Drill-down Drawer: per-partner payout list with bulk select ── */}
      {activePartner && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', justifyContent: 'flex-end',
            animation: 'fadeIn 0.2s ease-out forwards'
          }}
          onClick={closeDrawer}
        >
          <div
            style={{
              width: isMobile ? '100%' : '640px',
              height: '100%', background: 'white',
              boxShadow: '-20px 0 50px -10px rgba(15,23,42,0.4)',
              display: 'flex', flexDirection: 'column',
              animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div style={{ padding: '24px 28px', background: 'linear-gradient(135deg, #e11d48 0%, #881337 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '1.5px', marginBottom: '6px' }}>PARTNER PAYOUTS</div>
                <div style={{ fontSize: '20px', fontWeight: 950, wordBreak: 'break-word' }}>{activePartner.name}</div>
                <div style={{ marginTop: '14px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 950, opacity: 0.75, letterSpacing: '0.5px' }}>TOTAL</div>
                    <div style={{ fontSize: '14px', fontWeight: 950 }}>₹{activePartner.total.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 950, opacity: 0.75, letterSpacing: '0.5px', color: '#bbf7d0' }}>SETTLED</div>
                    <div style={{ fontSize: '14px', fontWeight: 950, color: '#bbf7d0' }}>₹{activePartner.paid.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 950, opacity: 0.75, letterSpacing: '0.5px', color: '#fed7d7' }}>UNPAID</div>
                    <div style={{ fontSize: '14px', fontWeight: 950, color: '#fed7d7' }}>₹{activePartner.unpaid.toLocaleString()}</div>
                  </div>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                aria-label="Close"
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >×</button>
            </div>

            {/* Bulk action bar */}
            {drawerSelectedIds.size > 0 && (
              <div style={{ padding: '12px 28px', background: '#fff5f6', borderBottom: '1px solid #fecdd3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 900, color: '#881337', letterSpacing: '0.5px' }}>
                  {drawerSelectedIds.size} of {activePartner.cuts.length} selected
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleBulkExport}
                    style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e11d48', background: 'white', color: '#e11d48', fontSize: '10px', fontWeight: 950, cursor: 'pointer', letterSpacing: '0.5px' }}
                  >📥 EXPORT</button>
                  <button
                    type="button"
                    onClick={openBulkPaidConfirm}
                    style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: 'white', fontSize: '10px', fontWeight: 950, cursor: 'pointer', letterSpacing: '0.5px', boxShadow: '0 4px 10px rgba(22,163,74,0.25)' }}
                  >✓ MARK AS PAID</button>
                </div>
              </div>
            )}

            {/* Payouts table / Mobile Cards */}
            <div style={{ flex: 1, overflow: 'auto', background: '#fafbfc', padding: isMobile ? '16px' : 0 }}>
              {isMobile && selectableDrawerCuts.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                  <input
                    type="checkbox"
                    checked={isAllDrawerSelected}
                    onChange={toggleSelectAllInDrawer}
                    style={{ width: '18px', height: '18px', accentColor: '#e11d48' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>Select All Eligible ({selectableDrawerCuts.length})</span>
                </div>
              )}

              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {activePartner.cuts.map(cut => {
                    const isLegacy = cut?.type === 'LEGACY';
                    const blockPayment = cut?.status !== 'PAID' && cut?.patientPaymentStatus !== 'PAID';
                    const isDisabled = isLegacy || blockPayment;
                    const amountFormatted = (Number(cut?.amount) || 0).toLocaleString();

                    return (
                      <div key={cut?.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.04)', opacity: (cut?.status !== 'PAID' && cut?.patientPaymentStatus !== 'PAID') ? 0.65 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <input
                              type="checkbox"
                              checked={drawerSelectedIds.has(cut?.id)}
                              onChange={() => toggleDrawerSelectRow(cut?.id)}
                              disabled={cut?.status === 'PAID' || cut?.patientPaymentStatus !== 'PAID'}
                              style={{ width: '18px', height: '18px', accentColor: '#e11d48', marginTop: '2px' }}
                            />
                            <div>
                              <div style={{ fontSize: '15px', fontWeight: 900, color: '#1e293b' }}>{(cut?.patientName || 'N/A').toUpperCase()}</div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginTop: '4px' }}>
                                {(cut?.modality || 'MRI').toUpperCase()}{cut?.reference ? ` · ${cut.reference}` : ''}
                              </div>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginTop: '4px' }}>{formatDate(cut?.date, true)}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '18px', fontWeight: 950, color: '#e11d48' }}>₹{amountFormatted}</div>
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>PATIENT PMT</span>
                          {cut?.patientPaymentStatus ? (
                            <span style={{
                              padding: '5px 10px', borderRadius: '8px',
                              fontSize: '10px', fontWeight: 900,
                              background: cut.patientPaymentStatus === 'PAID' ? '#dcfce7' : cut.patientPaymentStatus === 'PARTIAL' ? '#fef9c3' : '#fee2e2',
                              color: cut.patientPaymentStatus === 'PAID' ? '#166534' : cut.patientPaymentStatus === 'PARTIAL' ? '#713f12' : '#991b1b',
                            }}>
                              {cut.patientPaymentStatus === 'PAID' ? '✓ RECEIVED' : cut.patientPaymentStatus === 'PARTIAL' ? '½ PARTIAL' : '✗ NOT RECEIVED'}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>—</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            onClick={() => {
                              if (cut?.type === 'STRATEGIC' && !blockPayment) {
                                setConfirmModal({
                                  isOpen: true, cutId: cut?.id, currentStatus: cut?.status || 'UNPAID', patientName: cut?.patientName || 'N/A', amount: cut?.amount || 0
                                });
                              }
                            }}
                            disabled={isDisabled}
                            style={{
                              flex: 1, padding: '12px', borderRadius: '12px', border: 'none', fontSize: '12px', fontWeight: 950,
                              background: cut?.status === 'PAID' ? '#dcfce7' : isDisabled ? '#f1f5f9' : '#fee2e2',
                              color: cut?.status === 'PAID' ? '#166534' : isDisabled ? '#94a3b8' : '#991b1b',
                              cursor: isDisabled ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {cut?.status === 'PAID' ? '✓ PAID' : 'MARK PAID'}
                          </button>

                          {cut.type === 'LEGACY' ? (
                            <button
                              onClick={() => handleDeleteExpense(cut.id)}
                              style={{ padding: '12px 16px', borderRadius: '12px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '12px', fontWeight: 950, cursor: 'pointer' }}
                            >DEL</button>
                          ) : (
                            <button
                              onClick={() => {
                                setEditPayout({
                                  commissionId: cut.id, referrerId: cut.referrerId, referrerName: cut.name, amount: cut.amount, modality: cut.modality || 'MRI', remarks: (cut.description || '').includes(' - ') ? cut.description.split(' - ')[1] : '', invoiceId: cut.reference, status: cut.status
                                });
                                setIsPayoutDrawerOpen(true);
                              }}
                              style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#0f52ba', fontSize: '12px', fontWeight: 950, cursor: 'pointer' }}
                            >EDIT</button>
                          )}
                        </div>
                        {blockPayment && (
                           <div style={{ marginTop: '10px', fontSize: '11px', fontWeight: 800, color: '#f59e0b', textAlign: 'center' }}>⚠ Patient payment pending</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
                  <thead style={{ background: '#fff1f2', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '14px 12px', width: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isAllDrawerSelected}
                          onChange={toggleSelectAllInDrawer}
                          title="Select all payouts for this partner"
                          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#e11d48' }}
                        />
                      </th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'left' }}>DATE</th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'left' }}>PATIENT / STUDY</th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'center' }}>PATIENT PAYMENT</th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'right' }}>AMOUNT</th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'center' }}>STATUS</th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePartner.cuts.map(cut => (
                      <tr key={cut?.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: (cut?.status !== 'PAID' && cut?.patientPaymentStatus !== 'PAID') ? 0.55 : 1 }}>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={drawerSelectedIds.has(cut?.id)}
                            onChange={() => toggleDrawerSelectRow(cut?.id)}
                            disabled={cut?.status === 'PAID' || cut?.patientPaymentStatus !== 'PAID'}
                            title={cut?.status === 'PAID' ? 'Commission already paid' : cut?.patientPaymentStatus !== 'PAID' ? 'Patient payment not yet received' : undefined}
                            style={{ width: '14px', height: '14px', accentColor: '#e11d48', cursor: (cut?.status === 'PAID' || cut?.patientPaymentStatus !== 'PAID') ? 'not-allowed' : 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '12px 8px', fontSize: '10.5px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{formatDate(cut?.date, true)}</td>
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 850, color: '#1e293b' }}>{(cut?.patientName || 'N/A').toUpperCase()}</div>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', marginTop: '2px' }}>
                            {(cut?.modality || 'MRI').toUpperCase()}{cut?.reference ? ` · ${cut.reference}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          {cut?.patientPaymentStatus ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '3px',
                              padding: '4px 9px', borderRadius: '7px',
                              fontSize: '8.5px', fontWeight: 950, letterSpacing: '0.4px',
                              background: cut.patientPaymentStatus === 'PAID'
                                ? '#dcfce7'
                                : cut.patientPaymentStatus === 'PARTIAL'
                                ? '#fef9c3'
                                : '#fee2e2',
                              color: cut.patientPaymentStatus === 'PAID'
                                ? '#166534'
                                : cut.patientPaymentStatus === 'PARTIAL'
                                ? '#713f12'
                                : '#991b1b',
                            }}>
                              {cut.patientPaymentStatus === 'PAID'
                                ? '✓ RECEIVED'
                                : cut.patientPaymentStatus === 'PARTIAL'
                                ? '½ PARTIAL PAYMENT'
                                : '✗ NOT RECEIVED'}
                            </span>
                          ) : (
                            <span style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: 700 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: 950, color: '#e11d48', whiteSpace: 'nowrap' }}>₹{(Number(cut?.amount) || 0).toLocaleString()}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          {(() => {
                            const isLegacy = cut?.type === 'LEGACY';
                            const blockPayment = cut?.status !== 'PAID' && cut?.patientPaymentStatus !== 'PAID';
                            const isDisabled = isLegacy || blockPayment;
                            return (
                              <>
                                <button
                                  onClick={() => {
                                    if (cut?.type === 'STRATEGIC' && !blockPayment) {
                                      setConfirmModal({
                                        isOpen: true,
                                        cutId: cut?.id,
                                        currentStatus: cut?.status || 'UNPAID',
                                        patientName: cut?.patientName || 'N/A',
                                        amount: cut?.amount || 0
                                      });
                                    }
                                  }}
                                  disabled={isDisabled}
                                  title={blockPayment ? 'Patient payment not yet received' : undefined}
                                  style={{
                                    padding: '5px 10px', borderRadius: '7px', border: 'none', fontSize: '8.5px', fontWeight: 950,
                                    background: cut?.status === 'PAID' ? '#dcfce7' : isDisabled ? '#f1f5f9' : '#fee2e2',
                                    color: cut?.status === 'PAID' ? '#166534' : isDisabled ? '#94a3b8' : '#991b1b',
                                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                                    opacity: isDisabled && !isLegacy ? 0.7 : 1
                                  }}
                                >
                                  {cut?.status || 'UNPAID'}
                                </button>
                                {blockPayment && (
                                  <div style={{ marginTop: '4px', fontSize: '8px', fontWeight: 800, color: '#f59e0b', letterSpacing: '0.2px' }}>⚠ PATIENT UNPAID</div>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          {cut.type === 'LEGACY' ? (
                            <button
                              onClick={() => handleDeleteExpense(cut.id)}
                              style={{ padding: '5px 9px', borderRadius: '7px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '8.5px', fontWeight: 950, cursor: 'pointer' }}
                            >DEL</button>
                          ) : (
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
                              style={{ padding: '5px 10px', borderRadius: '7px', border: 'none', background: '#f0f4ff', color: '#0f52ba', fontSize: '8.5px', fontWeight: 950, cursor: 'pointer' }}
                            >UPDATE</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Mark-as-Paid confirmation modal */}
      {bulkConfirmModal.isOpen && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 100000, animation: 'fadeIn 0.2s ease-out forwards'
          }}
          onClick={() => setBulkConfirmModal({ isOpen: false, count: 0, total: 0, eligibleIds: [], partnerName: '' })}
        >
          <div
            style={{
              width: '90%', maxWidth: '460px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              borderRadius: '24px', border: '1px solid rgba(226, 232, 240, 0.8)',
              boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.15)',
              padding: '32px 26px', textAlign: 'center',
              animation: 'slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 20px auto', fontSize: '28px', boxShadow: '0 8px 20px -6px rgba(34, 197, 94, 0.25)' }}>✓</div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 950, color: '#1e293b', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              Mark {bulkConfirmModal.count} Payout{bulkConfirmModal.count !== 1 ? 's' : ''} as PAID?
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '12px', lineHeight: 1.6, color: '#475569', fontWeight: 700 }}>
              You're settling <strong style={{ color: '#16a34a' }}>₹{bulkConfirmModal.total.toLocaleString()}</strong> across <strong style={{ color: '#e11d48' }}>{bulkConfirmModal.partnerName}</strong>'s outstanding payouts.
              {bulkConfirmModal.count < drawerSelectedIds.size && (
                <span style={{ display: 'block', marginTop: '8px', fontSize: '10.5px', color: '#92400e', background: '#fef3c7', padding: '8px 12px', borderRadius: '8px', fontWeight: 800 }}>
                  ⚠ {drawerSelectedIds.size - bulkConfirmModal.count} of your selection are already PAID or legacy entries and will be skipped.
                </span>
              )}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setBulkConfirmModal({ isOpen: false, count: 0, total: 0, eligibleIds: [], partnerName: '' })}
                style={{ flex: 1, padding: '12px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '12px', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}
              >CANCEL</button>
              <button
                onClick={handleBulkMarkPaid}
                disabled={bulkConfirmModal.count === 0}
                style={{
                  flex: 1, padding: '12px 20px',
                  background: bulkConfirmModal.count === 0 ? '#cbd5e1' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: '#fff', border: 'none', borderRadius: '12px',
                  fontSize: '11px', fontWeight: 950,
                  cursor: bulkConfirmModal.count === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: bulkConfirmModal.count === 0 ? 'none' : '0 8px 18px -4px rgba(22, 163, 74, 0.35)'
                }}
              >CONFIRM</button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Glassmorphic Confirmation Modal */}
      {confirmModal.isOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 99999,
            animation: 'fadeIn 0.2s ease-out forwards'
          }}
          onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        >
          <div 
            style={{
              width: '90%',
              maxWidth: '440px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              borderRadius: '24px',
              border: '1px solid rgba(226, 232, 240, 0.8)',
              boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(15, 23, 42, 0.04)',
              padding: '30px 24px',
              textAlign: 'center',
              transform: 'scale(0.95)',
              animation: 'slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
              cursor: 'default'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dynamic Icon */}
            <div 
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: confirmModal.currentStatus === 'PAID' 
                  ? 'linear-gradient(135deg, #fee2e2 0%, #fecdd3 100%)' 
                  : 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                margin: '0 auto 20px auto',
                boxShadow: confirmModal.currentStatus === 'PAID'
                  ? '0 8px 20px -6px rgba(239, 68, 68, 0.2)'
                  : '0 8px 20px -6px rgba(34, 197, 94, 0.2)',
                fontSize: '24px'
              }}
            >
              {confirmModal.currentStatus === 'PAID' ? '🔄' : '💰'}
            </div>

            {/* Title */}
            <h3 
              style={{
                margin: '0 0 12px 0',
                fontSize: '15px',
                fontWeight: 950,
                color: '#1e293b',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
            >
              Confirm Status Transition
            </h3>

            {/* Description */}
            <p 
              style={{
                margin: '0 0 24px 0',
                fontSize: '12px',
                lineHeight: 1.6,
                color: '#475569',
                fontWeight: 700,
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
            >
              Are you sure you want to transition the commission status of the referral for <strong style={{ color: '#e11d48' }}>{confirmModal.patientName.toUpperCase()}</strong> (amounting to <strong style={{ color: '#10b981' }}>₹{confirmModal.amount.toLocaleString()}</strong>) from <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 950, background: confirmModal.currentStatus === 'PAID' ? '#dcfce7' : '#fee2e2', color: confirmModal.currentStatus === 'PAID' ? '#166534' : '#991b1b' }}>{confirmModal.currentStatus}</span> to <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 950, background: confirmModal.currentStatus === 'PAID' ? '#fee2e2' : '#dcfce7', color: confirmModal.currentStatus === 'PAID' ? '#991b1b' : '#166534' }}>{confirmModal.currentStatus === 'PAID' ? 'UNPAID' : 'PAID'}</span>? This will sync immediately with the ledger.
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 950,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
              >
                CANCEL
              </button>
              <button 
                onClick={() => {
                  handleToggleCommissionStatus(confirmModal.cutId, confirmModal.currentStatus);
                  setConfirmModal({ ...confirmModal, isOpen: false });
                }}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 950,
                  cursor: 'pointer',
                  boxShadow: '0 8px 18px -4px rgba(225, 29, 72, 0.3)',
                  transition: 'filter 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseOut={(e) => { e.currentTarget.style.filter = 'none'; }}
              >
                CONFIRM & CHANGE
              </button>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { transform: scale(0.9) translateY(20px); opacity: 0; }
              to { transform: scale(1) translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default ReferralHub;
