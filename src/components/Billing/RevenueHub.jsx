import React, { useMemo, useState, useEffect } from 'react';

const RevenueHub = ({
  filteredInvoices,
  liveStats,
  searchTerm,
  setSearchTerm,
  timeFilter,
  setTimeFilter,
  statusFilter,
  setStatusFilter,
  modalityFilter,
  setModalityFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  paginatedInvoices,
  renderPagination,
  handleOpenInvoice,
  handleDeleteInvoice,
  handlePrintA4,
  handlePrintThermal,
  handlePrintReceipt,
  isMobile,
  recordedPayouts,
  referralCommissions,
  setEditPayout,
  setIsPayoutDrawerOpen,
  referrers,
  setSelectedInvoice,
  setIsInvoiceDrawerOpen,
  sortConfig,
  handleSort,
  futureAppointments,
  paginatedFutureAppointments,
  serviceRegistry
}) => {
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ isOpen: false, invoiceId: null, commissionId: null, displayId: '' });

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'ASC' ? '↑' : '↓';
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

  const getServicePrice = (serviceName) => {
    const service = serviceRegistry.find(s => (s.serviceName || s.descriptor)?.toLowerCase() === serviceName?.toLowerCase());
    return service ? (service.amount || service.unitPrice || 0) : 0;
  };

  const getServiceCut = (app) => {
    if (app.referralCutValue) return app.referralCutValue;
    const service = serviceRegistry.find(s => (s.serviceName || s.descriptor)?.toLowerCase() === app.service?.toLowerCase());
    if (service && service.referralCutValue) return service.referralCutValue;
    if (app.referrerName || app.doctor) return getServicePrice(app.service) * 0.2;
    return 0;
  };

  const futureStats = useMemo(() => {
    const apps = futureAppointments || [];
    let gross = 0;
    let referralCut = 0;
    
    apps.forEach(app => {
      const price = getServicePrice(app.service);
      const cut = getServiceCut(app);
      gross += price;
      referralCut += cut;
    });
    
    return {
      gross,
      referralCut,
      net: gross - referralCut
    };
  }, [futureAppointments, serviceRegistry]);

  const [selectedIds, setSelectedIds] = useState(new Set());

  // Reset selected rows whenever filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [timeFilter, statusFilter, modalityFilter, searchTerm, startDate, endDate]);

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
    if (timeFilter === 'FUTURE') {
      const apps = paginatedFutureAppointments || [];
      const invs = paginatedInvoices || [];
      return [
        ...apps.map(a => ({ id: a.appointmentId, type: 'app' })),
        ...invs.map(i => ({ id: i.invoiceId, type: 'inv' }))
      ];
    } else {
      return (paginatedInvoices || []).map(i => ({ id: i.invoiceId, type: 'inv' }));
    }
  }, [timeFilter, paginatedFutureAppointments, paginatedInvoices]);

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
    let headers = [];
    let rows = [];
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const isExportingSelected = selectedIds.size > 0;
    const fileName = `1RAD_Financial_Report_${timeFilter}_${isExportingSelected ? 'Selected' : 'All'}_${timestampStr}`;

    if (timeFilter === 'FUTURE') {
      headers = [
        'Appointment ID',
        'Patient Name',
        'Referred By',
        'Scheduled For',
        'Modality',
        'Service Name',
        'Projected Revenue (INR)',
        'Estimated Referral Cut (INR)',
        'Estimated Net (INR)'
      ];

      // Future appointments
      const apps = futureAppointments || [];
      const filteredApps = isExportingSelected 
        ? apps.filter(app => selectedIds.has(app.appointmentId)) 
        : apps;

      filteredApps.forEach(app => {
        const price = getServicePrice(app.service);
        const cut = getServiceCut(app);
        rows.push([
          app.displayId || 'N/A',
          app.patientName || 'UNKNOWN',
          app.referredBy || app.referrerName || 'SELF',
          formatDate(app.date || app.dateTime),
          app.modality || 'US',
          app.service || 'N/A',
          price,
          cut,
          price - cut
        ]);
      });

      // Pre-billed future transactions
      const preBilled = filteredInvoices || [];
      const filteredPreBilled = isExportingSelected 
        ? preBilled.filter(inv => selectedIds.has(inv.invoiceId)) 
        : preBilled;

      filteredPreBilled.forEach(inv => {
        rows.push([
          inv.displayId || 'N/A',
          inv.patientName || 'UNKNOWN',
          inv.referrerName || 'SELF',
          'PRE-BILLED',
          inv.modality || 'US',
          'MANUAL_INVOICE_LEDGER',
          inv.totalAmount || 0,
          inv.commissionAmount || 0,
          (inv.totalAmount || 0) - (inv.commissionAmount || 0)
        ]);
      });
    } else {
      headers = [
        'Invoice ID',
        'Patient Name',
        'Referred By',
        'Timestamp',
        'Modality',
        'Gross Amount (INR)',
        'Discount Amount (INR)',
        'Net Payable (INR)',
        'Referral Cut (INR)',
        'Net Clinic Income (INR)',
        'Status'
      ];

      const invoicesToExport = filteredInvoices || [];
      const filteredInvoicesToExport = isExportingSelected 
        ? invoicesToExport.filter(inv => selectedIds.has(inv.invoiceId)) 
        : invoicesToExport;

      filteredInvoicesToExport.forEach(inv => {
        rows.push([
          inv.displayId || 'N/A',
          inv.patientName || 'UNKNOWN',
          inv.referrerName || 'SELF',
          formatDate(inv.createdAt, true),
          inv.modality || 'US',
          inv.grossAmount || 0,
          inv.discountAmount || 0,
          inv.totalAmount || 0,
          inv.commissionAmount || 0,
          (inv.totalAmount || 0) - (inv.commissionAmount || 0),
          inv.status || 'PENDING'
        ]);
      });
    }

    // Convert rows to CSV formatted string
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

  return (
    <div className="invoices-main" style={{ animation: 'fadeIn 0.3s' }}>
      <div className="filter-matrix" style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? '15px' : '30px', 
        marginBottom: '30px', 
        background: '#f1f5f9', 
        padding: isMobile ? '15px' : '15px 25px', 
        borderRadius: '18px', 
        border: '1px solid #e2e8f0', 
        alignItems: isMobile ? 'stretch' : 'center' 
      }}>
         <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '8px' : '15px' }}>
            <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>TEMPORAL_FILTER:</span>
            <div style={{ 
              display: 'flex', 
              background: 'white', 
              padding: '3px', 
              borderRadius: '10px', 
              border: '1px solid #e2e8f0',
              overflowX: 'auto',
              width: isMobile ? '100%' : 'auto'
            }}>
               {['TODAY', 'PAST', 'ALL', 'CUSTOM', 'FUTURE'].map(t => (
                 <button 
                  key={t}
                  onClick={() => setTimeFilter(t)}
                  style={{ 
                    padding: '8px 12px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                    background: timeFilter === t ? 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)' : 'transparent',
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

         {!isMobile && <div style={{ width: '1px', height: '30px', background: '#cbd5e1' }}></div>}

         {timeFilter !== 'FUTURE' && (
           <>
             <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '8px' : '15px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>STATUS:</span>
                <div style={{ display: 'flex', background: 'white', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0', width: isMobile ? '100%' : 'auto' }}>
                   {['ALL', 'PAID', 'PENDING'].map(s => (
                     <button 
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      style={{ 
                        padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: statusFilter === s ? '#0f52ba' : 'transparent',
                        color: statusFilter === s ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s',
                        flex: isMobile ? 1 : 'none'
                      }}
                     >{s}</button>
                   ))}
                </div>
             </div>
             {!isMobile && <div style={{ width: '1px', height: '30px', background: '#cbd5e1' }}></div>}
           </>
         )}

         <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '8px' : '15px' }}>
            <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>MODALITY:</span>
            <div style={{ display: 'flex', background: 'white', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0', width: isMobile ? '100%' : 'auto' }}>
               {['ALL', 'MRI', 'CT', 'X-RAY', 'USG'].map(m => (
                 <button 
                  key={m}
                  onClick={() => setModalityFilter(m)}
                  style={{ 
                    padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                    background: modalityFilter === m ? '#0f52ba' : 'transparent',
                    color: modalityFilter === m ? 'white' : '#64748b',
                    cursor: 'pointer', transition: 'all 0.2s',
                    flex: isMobile ? 1 : 'none'
                  }}
                 >{m}</button>
               ))}
            </div>
         </div>

          <div style={{ marginLeft: isMobile ? '0' : 'auto', display: 'flex', alignItems: 'center', gap: '15px', justifyContent: isMobile ? 'center' : 'flex-end', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>RECORDS:</span>
              <span style={{ background: '#0f52ba', color: 'white', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 950 }}>
                {timeFilter === 'FUTURE' ? ((futureAppointments?.length || 0) + (filteredInvoices?.length || 0)) : (filteredInvoices?.length || 0)}
              </span>
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
              <span>{selectedIds.size > 0 ? `📥 EXPORT SELECTED (${selectedIds.size})` : '📥 EXPORT EXCEL'}</span>
            </button>
          </div>
      </div>

      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)', gap: isMobile ? '15px' : '25px', marginBottom: '40px' }}>
        {timeFilter === 'FUTURE' ? (
          <>
            <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', gridColumn: isMobile ? '1' : 'span 2' }}>
              <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>PROJECTED_GROSS</p>
              <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: 950, color: '#0f52ba' }}>₹{futureStats.gross.toLocaleString()}</div>
              <div style={{ marginTop: '10px', fontSize: '10px', color: '#64748b', fontWeight: 800 }}>{(futureAppointments?.length || 0)} MISSIONS SCHEDULED</div>
            </div>
            <div className="kpi-card" style={{ background: '#fff1f2', padding: '25px', borderRadius: '24px', border: '1px solid #fecdd3', boxShadow: '0 4px 20px rgba(225,29,72,0.05)', gridColumn: isMobile ? '1' : 'span 1' }}>
              <p style={{ fontSize: '11px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', marginBottom: '15px' }}>PROJECTED_CUTS</p>
              <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: 950, color: '#881337' }}>₹{futureStats.referralCut.toLocaleString()}</div>
            </div>
            <div className="kpi-card" style={{ background: '#f0fdf4', padding: '25px', borderRadius: '24px', border: '1px solid #dcfce7', boxShadow: '0 4px 20px rgba(22,101,52,0.05)', gridColumn: isMobile ? '1' : 'span 2' }}>
              <p style={{ fontSize: '11px', fontWeight: 950, color: '#166534', letterSpacing: '1px', marginBottom: '15px' }}>EXPECTED_NET</p>
              <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: 950, color: '#14532d' }}>₹{futureStats.net.toLocaleString()}</div>
            </div>
          </>
        ) : (
          <>
            <div className="kpi-card" style={{ background: 'white', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>GROSS REVENUE</p>
              <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 950, color: '#1a1a2e' }}>₹{liveStats.totalRevenue.toLocaleString()}</div>
            </div>
            <div className="kpi-card" style={{ background: 'white', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>PENDING</p>
              <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 950, color: '#f39c12' }}>₹{liveStats.pendingRevenue.toLocaleString()}</div>
            </div>
            <div className="kpi-card" style={{ background: '#f0fdf4', padding: '20px', borderRadius: '24px', border: '1px solid #dcfce7', boxShadow: '0 4px 20px rgba(22,101,52,0.05)' }}>
              <p style={{ fontSize: '10px', fontWeight: 950, color: '#166534', letterSpacing: '1px', marginBottom: '12px' }}>NET REVENUE</p>
              <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 950, color: '#14532d' }}>₹{liveStats.netProfit.toLocaleString()}</div>
            </div>
            <div className="kpi-card" style={{ background: 'white', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>DISCOUNTS</p>
              <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 950, color: '#ef4444' }}>₹{liveStats.totalDiscount.toLocaleString()}</div>
            </div>
            <div className="kpi-card" style={{ background: '#fff1f2', padding: '20px', borderRadius: '24px', border: '1px solid #fecdd3', boxShadow: '0 4px 20px rgba(225,29,72,0.05)' }}>
              <p style={{ fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', marginBottom: '12px' }}>CUTS</p>
              <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 950, color: '#881337' }}>₹{liveStats.totalCommission.toLocaleString()}</div>
            </div>
          </>
        )}
      </div>

      <div className="content-main" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
        <div style={{ background: 'white', borderRadius: isMobile ? '16px' : '24px', border: '1px solid #e2e8f0', padding: isMobile ? '20px' : '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
           <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: '15px', marginBottom: '25px' }}>
             <h3 style={{ fontSize: '14px', fontWeight: 950, letterSpacing: '1px', margin: 0 }}>
               {timeFilter === 'FUTURE' ? 'UPCOMING REVENUE LEDGER' : 'GLOBAL TRANSACTION LEDGER'}
             </h3>
             {/* Table-level search */}
             <div style={{ position: 'relative', width: isMobile ? '100%' : '340px' }}>
               <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
               <input
                 type="text"
                 value={searchTerm || ''}
                 onChange={e => setSearchTerm(e.target.value)}
                 placeholder="Search by patient name or invoice ID..."
                 style={{
                   width: '100%',
                   padding: '10px 36px 10px 36px',
                   borderRadius: '10px',
                   border: '1px solid #e2e8f0',
                   fontSize: '12px',
                   fontWeight: 600,
                   outline: 'none',
                   background: '#f8fafc',
                   boxSizing: 'border-box',
                   transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
                 }}
                 onFocus={e => { e.target.style.borderColor = '#0f52ba'; e.target.style.boxShadow = '0 0 0 3px rgba(15, 82, 186, 0.1)'; e.target.style.background = 'white'; }}
                 onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; }}
               />
               {searchTerm && (
                 <button
                   type="button"
                   onClick={() => setSearchTerm('')}
                   aria-label="Clear search"
                   style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: 0, lineHeight: 1 }}
                 >×</button>
               )}
             </div>
           </div>
           <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '1000px' : 'auto' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                  <th style={{ padding: '15px 10px', width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={isAllVisibleSelected} 
                      onChange={toggleSelectAllVisible}
                      style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#0f52ba', borderRadius: '4px' }}
                    />
                  </th>
                  {timeFilter === 'FUTURE' ? (
                    <>
                       <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>APPT_ID</th>
                       <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PATIENT_ENTITY</th>
                       <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>REFERRED_BY</th>
                       <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>SCHEDULED_FOR</th>
                       <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>MODALITY</th>
                       <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>SERVICE_NAME</th>
                       <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', textAlign: 'right' }}>PROJECTED_REV</th>
                       <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'right' }}>EST_CUT</th>
                       <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#166534', letterSpacing: '1px', textAlign: 'right' }}>EST_NET</th>
                    </>
                  ) : (
                    <>
                      <th onClick={() => handleSort('displayId')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>INVOICE_ID {getSortIcon('displayId')}</th>
                      <th onClick={() => handleSort('patientName')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PATIENT_ENTITY {getSortIcon('patientName')}</th>
                      <th onClick={() => handleSort('referrerName')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>REFERRED_BY {getSortIcon('referrerName')}</th>
                      <th onClick={() => handleSort('date')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>TIMESTAMP {getSortIcon('date')}</th>
                      <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>MODALITY</th>
                      <th onClick={() => handleSort('grossAmount')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#1e293b', letterSpacing: '1px', background: '#f8fafc' }}>GROSS {getSortIcon('grossAmount')}</th>
                      <th onClick={() => handleSort('discountAmount')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px', background: '#fff1f2' }}>DISCOUNT {getSortIcon('discountAmount')}</th>
                      <th onClick={() => handleSort('totalAmount')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', background: '#f0f4ff' }}>NET_PAYABLE {getSortIcon('totalAmount')}</th>
                      <th onClick={() => handleSort('commissionAmount')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>CUT {getSortIcon('commissionAmount')}</th>
                      <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#166534', letterSpacing: '1px', background: '#f0fdf4' }}>INCOME</th>
                      <th onClick={() => handleSort('status')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>STATUS {getSortIcon('status')}</th>
                      <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', textAlign: 'right' }}>ACTIONS</th>
                    </>
                  )}
                </tr>
              </thead>
             <tbody>
               {timeFilter === 'FUTURE' ? (
                 <>
                   {paginatedFutureAppointments.map(app => (
                     <tr key={app.appointmentId} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '20px 10px', textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedIds.has(app.appointmentId)} 
                            onChange={() => toggleSelectRow(app.appointmentId)}
                            style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: '#0f52ba' }}
                          />
                        </td>
                        <td style={{ padding: '20px 10px', fontSize: '11px', fontWeight: 900, color: '#64748b', fontFamily: 'monospace' }}>{app.displayId}</td>
                        <td style={{ padding: '20px 10px', fontSize: '11.5px', fontWeight: 800, color: '#1e293b' }}>{(app.patientName || 'UNKNOWN').toUpperCase()}</td>
                        <td style={{ padding: '20px 10px', fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{(app.referredBy || app.referrerName || 'SELF').toUpperCase()}</td>
                        <td style={{ padding: '20px 10px', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{formatDate(app.date || app.dateTime)}</td>
                        <td style={{ padding: '20px 10px' }}>
                          <span style={{ padding: '4px 8px', background: '#f1f5f9', borderRadius: '6px', fontSize: '9px', fontWeight: 950, color: '#0f52ba' }}>{(app.modality || 'US').toUpperCase()}</span>
                        </td>
                        <td style={{ padding: '20px 10px', fontSize: '11px', fontWeight: 700, color: '#1e293b' }}>{app.service}</td>
                        <td style={{ padding: '20px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 950, color: '#0f52ba' }}>₹{getServicePrice(app.service).toLocaleString()}</td>
                        <td style={{ padding: '20px 10px', textAlign: 'right', fontSize: '11.5px', fontWeight: 950, color: '#e11d48' }}>
                          {getServiceCut(app) > 0 ? `₹${getServiceCut(app).toLocaleString()}` : '—'}
                        </td>
                        <td style={{ padding: '20px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 950, color: '#166534' }}>
                          ₹{(getServicePrice(app.service) - getServiceCut(app)).toLocaleString()}
                        </td>
                     </tr>
                   ))}
                   {paginatedInvoices.length > 0 && (
                     <tr style={{ background: '#f1f5f9' }}>
                       <td colSpan="10" style={{ padding: '12px 20px', fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px' }}>PRE-BILLED_FUTURE_TRANSACTIONS</td>
                     </tr>
                   )}
                   {paginatedInvoices.map(inv => (
                     <tr key={inv.invoiceId} style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc', opacity: 0.85 }}>
                        <td style={{ padding: '15px 10px', textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedIds.has(inv.invoiceId)} 
                            onChange={() => toggleSelectRow(inv.invoiceId)}
                            style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: '#0f52ba' }}
                          />
                        </td>
                        <td style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 900, color: '#64748b', fontFamily: 'monospace' }}>{inv.displayId}</td>
                        <td style={{ padding: '15px 10px', fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>{(inv.patientName || 'UNKNOWN').toUpperCase()}</td>
                        <td style={{ padding: '15px 10px', fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{(inv.referrerName || 'SELF').toUpperCase()}</td>
                        <td style={{ padding: '15px 10px', fontSize: '10px', color: '#0f52ba', fontWeight: 900 }}>BILLED</td>
                        <td colSpan="2" style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 700, color: '#64748b' }}>MANUAL_INVOICE_LEDGER</td>
                        <td style={{ padding: '15px 10px', textAlign: 'right', fontSize: '11.5px', fontWeight: 950, color: '#0f52ba' }}>₹{(inv.totalAmount || 0).toLocaleString()}</td>
                        <td style={{ padding: '15px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#e11d48' }}>₹{(inv.commissionAmount || 0).toLocaleString()}</td>
                        <td style={{ padding: '15px 10px', textAlign: 'right', fontSize: '11.5px', fontWeight: 950, color: '#166534' }}>₹{(inv.totalAmount - (inv.commissionAmount || 0)).toLocaleString()}</td>
                     </tr>
                   ))}
                 </>
               ) : (
                 paginatedInvoices.map(inv => (
                   <tr key={inv.invoiceId} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                     <td style={{ padding: '20px 10px', textAlign: 'center' }}>
                       <input 
                         type="checkbox" 
                         checked={selectedIds.has(inv.invoiceId)} 
                         onChange={() => toggleSelectRow(inv.invoiceId)}
                         style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: '#0f52ba' }}
                       />
                     </td>
                     <td style={{ padding: '20px 10px', fontSize: '11px', fontWeight: 900, color: '#0f52ba', fontFamily: 'monospace' }}>{inv?.displayId || 'N/A'}</td>
                     <td style={{ padding: '20px 10px', fontSize: '11.5px', fontWeight: 800, color: '#1e293b' }}>{(inv?.patientName || 'UNKNOWN').toUpperCase()}</td>
                     <td style={{ padding: '20px 10px', fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{(inv?.referrerName || 'SELF').toUpperCase()}</td>
                     <td style={{ padding: '20px 10px', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{formatDate(inv?.createdAt, true)}</td>
                     <td style={{ padding: '20px 10px' }}>
                       <span style={{ padding: '4px 8px', background: '#f1f5f9', borderRadius: '6px', fontSize: '9px', fontWeight: 950, color: '#0f52ba' }}>{(inv.modality || 'US').toUpperCase()}</span>
                     </td>
                     <td style={{ padding: '20px 10px', fontSize: '11.5px', fontWeight: 700, color: '#64748b', background: '#f8fafc' }}>₹{(inv.grossAmount || 0).toLocaleString()}</td>
                     <td style={{ padding: '20px 10px', fontSize: '11.5px', fontWeight: 950, color: '#ef4444', background: '#fff1f2' }}>{(inv?.discountAmount || 0) > 0 ? `-₹${(inv.discountAmount || 0).toLocaleString()}` : '—'}</td>
                     <td style={{ padding: '20px 10px', fontSize: '12px', fontWeight: 950, color: '#0f52ba', background: '#f0f4ff' }}>₹{(inv?.totalAmount || 0).toLocaleString()}</td>
                     <td style={{ padding: '20px 10px' }}>
                         {(Number(inv?.commissionAmount) || 0) > 0 ? (
                           <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '13px', fontWeight: 950, color: '#e11d48' }}>₹{(Number(inv?.commissionAmount) || 0).toLocaleString()}</span>
                              <span style={{ fontSize: '8px', fontWeight: 800, color: '#e11d48', opacity: 0.7 }}>LOGGED_PAYOUT</span>
                           </div>
                         ) : (
                           <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>—</span>
                         )}
                     </td>
                     <td style={{ padding: '20px 10px', fontSize: '12px', fontWeight: 950, color: '#166534', background: '#f0fdf4' }}>₹{(Number(inv?.totalAmount || 0) - (Number(inv?.commissionAmount) || 0)).toLocaleString()}</td>
                     <td style={{ padding: '20px 10px' }}>
                        <span style={{ 
                          padding: '6px 12px', borderRadius: '8px', fontSize: '8.5px', fontWeight: 950,
                          background: inv?.status === 'PAID' ? '#ecfdf5' : '#fff7ed',
                          color: inv?.status === 'PAID' ? '#059669' : '#ea580c'
                        }}>
                          {inv?.status || 'PENDING'}
                        </span>
                     </td>
                     <td style={{ padding: '20px 10px', textAlign: 'right', display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button 
                          onClick={() => {
                             let cutAmount = inv.commissionAmount || 0;
                             if (cutAmount === 0 && inv.items?.length > 0) {
                                cutAmount = inv.items.reduce((sum, item) => {
                                  const service = serviceRegistry?.find(s => (s.serviceName || s.descriptor)?.toLowerCase() === item.description?.toLowerCase());
                                  return sum + ((service?.referralCutValue || 0) * (item.quantity || 1));
                                }, 0);
                             }
                             // Multi-stage identity resolution
                             let refId = inv.referrerId;
                             if (!refId && inv.referrerName) {
                                const match = referrers.find(r => r.name?.toLowerCase() === (inv.referrerName || '').toLowerCase());
                                if (match) refId = match.referrerId || match.id;
                             }

                             if (!inv.commissionId) {
                                setErrorModal({
                                  isOpen: true,
                                  title: "FISCAL COMPLIANCE WARNING",
                                  message: `No active commission record found for invoice ${inv.displayId}. Update is not permitted until a referrer setting is configured.`
                                });
                                return;
                              }

                              const existingCommission = (referralCommissions || []).find(c =>
                                c.id === inv.commissionId
                              );
                              setEditPayout({
                                 commissionId: inv.commissionId,
                                 referrerId: existingCommission?.referrerId || refId || '',
                                 referrerName: existingCommission?.referrerName || inv.referrerName || 'DIRECT',
                                 amount: existingCommission != null ? existingCommission.amount : (inv.commissionAmount || cutAmount || ''),
                                 modality: existingCommission?.modality || inv.modality || 'MRI',
                                 remarks: existingCommission?.remarks || `Commission for ${inv.displayId} (${inv.patientName})`,
                                 invoiceId: inv.displayId,
                                 status: existingCommission?.status || 'UNPAID'
                              });
                             setIsPayoutDrawerOpen(true);
                          }}
                           style={{ 
                             padding: '6px 10px', borderRadius: '10px', border: 'none', 
                             background: '#fff1f2', 
                             color: '#e11d48', 
                             fontSize: '8.5px', fontWeight: 950, 
                             cursor: 'pointer', 
                             boxShadow: '0 2px 5px rgba(225,29,72,0.1)' 
                           }} >UPDATE PAYOUT</button>

                         <button 
                           onClick={() => handlePrintA4(inv)}
                           title="Print A4 Invoice"
                           style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #0f52ba', background: 'white', color: '#0f52ba', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                         >A4</button>
                         <button 
                           onClick={() => handlePrintThermal(inv)}
                           title="Print Thermal Receipt"
                           style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                         >SLIP</button>
                         <button 
                           onClick={() => handlePrintReceipt(inv)}
                           title="Print Payment Receipt"
                           style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #10b981', background: 'white', color: '#10b981', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                         >RCPT</button>
                         <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 5px' }}></div>
                        <button 
                          onClick={() => { setSelectedInvoice(inv); setIsInvoiceDrawerOpen(true); }}
                          style={{ padding: '6px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#0f52ba', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                        >{inv.status === 'PAID' ? 'VIEW' : 'PAYMENT'}</button>




                        {inv?.status === 'PAID' ? (
                           <span title="Cannot delete a paid invoice" style={{ padding: '6px 10px', borderRadius: '10px', background: '#f1f5f9', color: '#cbd5e1', fontSize: '9px', fontWeight: 950, cursor: 'not-allowed', userSelect: 'none' }}>🔒 LOCKED</span>
                         ) : (
                           <button
                             onClick={() => setDeleteConfirmModal({ isOpen: true, invoiceId: inv.invoiceId, commissionId: inv.commissionId, displayId: inv.displayId || 'N/A' })}
                             style={{ padding: '6px 10px', borderRadius: '10px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                           >DEL</button>
                         )}
                     </td>
                   </tr>
                 ))
               )}
                {(timeFilter === 'FUTURE' ? ((futureAppointments?.length || 0) + (filteredInvoices?.length || 0)) : (filteredInvoices?.length || 0)) === 0 && (
                  <tr>
                    <td colSpan="12" style={{ padding: '80px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO DATA DETECTED IN ACTIVE SCOPE</td>
                  </tr>
                )}
             </tbody>
           </table>
            {renderPagination()}
          </div>
       </div>
     </div>

     {/* Premium Glassmorphic Error Dialog Modal */}
     {errorModal.isOpen && (
       <div 
         style={{
           position: 'fixed',
           top: 0,
           left: 0,
           width: '100vw',
           height: '100vh',
           background: 'rgba(15, 23, 42, 0.45)',
           backdropFilter: 'blur(12px)',
           WebkitBackdropFilter: 'blur(12px)',
           display: 'flex',
           justifyContent: 'center',
           alignItems: 'center',
           zIndex: 99999,
           animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
         }}
         onClick={() => setErrorModal({ ...errorModal, isOpen: false })}
       >
         <div 
           style={{
             width: '90%',
             maxWidth: '420px',
             background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
             borderRadius: '24px',
             border: '1px solid rgba(226, 232, 240, 0.8)',
             boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(15, 23, 42, 0.02)',
             padding: '30px 24px',
             textAlign: 'center',
             transform: 'scale(0.95)',
             animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
             cursor: 'default'
           }}
           onClick={(e) => e.stopPropagation()}
         >
           {/* Sleek Alert Warning Shield Icon */}
           <div 
             style={{
               width: '60px',
               height: '60px',
               borderRadius: '50%',
               background: 'linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%)',
               display: 'flex',
               justifyContent: 'center',
               alignItems: 'center',
               margin: '0 auto 20px auto',
               boxShadow: '0 8px 20px -6px rgba(225, 29, 72, 0.25)',
               fontSize: '24px'
             }}
           >
             ⚠️
           </div>

           {/* Title */}
           <h3 
             style={{
               margin: '0 0 12px 0',
               fontSize: '15px',
               fontWeight: 950,
               color: '#e11d48',
               letterSpacing: '0.8px',
               textTransform: 'uppercase',
               fontFamily: 'system-ui, -apple-system, sans-serif'
             }}
           >
             {errorModal.title}
           </h3>

           {/* Message */}
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
             {errorModal.message}
           </p>

           {/* Action Button */}
           <button 
             onClick={() => setErrorModal({ ...errorModal, isOpen: false })}
             style={{
               width: '100%',
               padding: '12px 20px',
               background: 'linear-gradient(135deg, #0f52ba 0%, #0a3d91 100%)',
               color: '#ffffff',
               border: 'none',
               borderRadius: '14px',
               fontSize: '11px',
               fontWeight: 950,
               cursor: 'pointer',
               boxShadow: '0 8px 18px -4px rgba(15, 82, 186, 0.35)',
               transition: 'transform 0.15s, filter 0.15s'
             }}
             onMouseOver={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
             onMouseOut={(e) => { e.currentTarget.style.filter = 'none'; }}
           >
             ACKNOWLEDGE & CLOSE
           </button>
         </div>
         
         {/* Inject Dynamic Keyframe Animations */}
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

      {/* Premium Glassmorphic Delete Confirmation Modal */}
      {deleteConfirmModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.85)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '24px',
            padding: '30px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.15), 0 0 40px rgba(0, 0, 0, 0.05)',
            textAlign: 'center',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            transform: 'scale(1)',
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            color: '#1e293b'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: '#fef2f2',
              border: '1px solid #fee2e2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 8px 16px rgba(239, 68, 68, 0.1)'
            }}>
              <span style={{ fontSize: '32px' }}>🗑️</span>
            </div>
            
            <h3 style={{
              fontSize: '20px',
              fontWeight: 950,
              color: '#991b1b',
              margin: '0 0 10px 0',
              letterSpacing: '-0.025em'
            }}>
              Delete Invoice
            </h3>
            
            <p style={{
              fontSize: '14px',
              color: '#475569',
              lineHeight: '1.6',
              margin: '0 0 24px 0',
              fontWeight: 600
            }}>
              Are you sure you want to delete invoice <strong style={{ color: '#0f172a', fontWeight: 800 }}>{deleteConfirmModal.displayId}</strong>?
              <span style={{ display: 'block', marginTop: '8px', fontSize: '12px', color: '#dc2626', fontWeight: 700 }}>
                This action is irreversible and will permanently purge this record!
              </span>
            </p>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setDeleteConfirmModal({ isOpen: false, invoiceId: null, commissionId: null, displayId: '' })}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  borderRadius: '14px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#ffffff';
                }}
              >
                No, Keep It
              </button>
              
              <button
                onClick={() => {
                  handleDeleteInvoice(deleteConfirmModal.invoiceId, deleteConfirmModal.commissionId);
                  setDeleteConfirmModal({ isOpen: false, invoiceId: null, commissionId: null, displayId: '' });
                }}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  borderRadius: '14px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: '0 10px 15px -3px rgba(220, 38, 38, 0.3)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 12px 20px -3px rgba(220, 38, 38, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'none';
                  e.target.style.boxShadow = '0 10px 15px -3px rgba(220, 38, 38, 0.3)';
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
   </div>
   );
};

export default RevenueHub;
