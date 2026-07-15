import * as XLSX from 'xlsx-js-style';
import React, { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { approvalForInvoice, approvalBadge } from '../../utils/approvalLookup';
import { celebrate } from '../../utils/celebrate';

// One-time keyframe for the row-actions menu's "grow from the button" entrance.
if (typeof document !== 'undefined' && !document.getElementById('row-actions-menu-kf')) {
  const s = document.createElement('style');
  s.id = 'row-actions-menu-kf';
  s.textContent = '@keyframes rowMenuIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}

// Premium row-actions dropdown — collapses a row's action buttons behind a
// single "⋯" trigger so the table stays clean. The menu is rendered fixed
// (anchored to the trigger) so it is never clipped by the table's overflow,
// and closes on outside-click, scroll or resize. Children are the existing
// action buttons, stacked as menu rows.
function RowActionsMenu({ children, isMobile }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { top, left, origin } — null until measured
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  // Place the menu attached to the trigger, opening downward. If it would slip
  // under the viewport bottom, nudge it up only enough to stay fully visible
  // (no jarring full-flip). Measures the REAL menu height first so the clamp is
  // exact regardless of how many actions the row has.
  const place = useCallback(() => {
    const b = wrapRef.current?.getBoundingClientRect();
    const m = menuRef.current;
    if (!b || !m) return;
    const margin = 8;
    const W = m.offsetWidth || 230;
    const H = m.offsetHeight || 240;
    let left = Math.min(Math.max(margin, b.right - W), window.innerWidth - W - margin);
    let top = b.bottom + 6;
    let oy = 'top';
    if (top + H > window.innerHeight - margin) {
      const above = b.top - 6 - H;
      if (above >= margin) { top = above; oy = 'bottom'; }       // open just above the button
      else { top = Math.max(margin, window.innerHeight - H - margin); } // clamp into view
    }
    const ox = (b.right - left) > W / 2 ? 'right' : 'left';
    setPos({ top, left, origin: `${oy} ${ox}` });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ display: 'inline-block', position: 'relative' }}>
      <button onClick={() => { setPos(null); setOpen(o => !o); }} title="Actions"
        style={{ width: isMobile ? '42px' : '36px', height: isMobile ? '42px' : '34px', borderRadius: '10px', border: '1px solid #e2e8f0', background: open ? 'linear-gradient(135deg,#0f52ba,#1d4ed8)' : 'white', color: open ? 'white' : '#475569', fontSize: isMobile ? '20px' : '18px', fontWeight: 900, cursor: 'pointer', lineHeight: 1, boxShadow: open ? '0 6px 16px -4px rgba(15,82,186,0.5)' : '0 1px 3px rgba(0,0,0,0.06)' }}>
        ⋯
      </button>
      {open && (
        <div ref={menuRef} onClick={() => setOpen(false)}
          style={{ position: 'fixed', top: pos ? pos.top : -9999, left: pos ? pos.left : -9999, transformOrigin: pos ? pos.origin : 'top right', width: '230px', maxHeight: '70vh', overflowY: 'auto', background: 'white', borderRadius: '16px', border: '1px solid #e7ecf3', boxShadow: '0 22px 50px -12px rgba(15,23,42,0.35)', padding: '8px', zIndex: 100000, display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch', opacity: pos ? undefined : 0, animation: pos ? 'rowMenuIn 0.13s ease-out' : 'none' }}>
          {children}
        </div>
      )}
    </div>
  );
}

const RevenueHub = ({
  filteredInvoices,
  advanceByPatient = {},
  approvalMap = { byInvoice: {}, byAppointment: {} },
  approvalFilter = 'ALL',
  setApprovalFilter = () => {},
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
  // ── Cursor-pagination props (replaces paginatedInvoices + renderPagination) ──
  pagedInvoices = [],
  invoiceTotalCount = 0,
  invoiceHasMore = false,
  onLoadMoreInvoices = () => {},
  invoiceLoadingMore = false,
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

  // Whether the referrer's commission for this invoice is already PAID. Once it
  // is, "Update payout" is locked by default — money has already changed hands,
  // so any change must go through Admin Approval (revert the PAID badge → request
  // approval), not a silent edit here.
  const isPayoutPaid = (inv) => (referralCommissions || []).some(c =>
    ((c.referenceNumber || c.reference) === inv.displayId || c.id === inv.commissionId)
    && String(c.status || c.commissionStatus || '').toUpperCase() === 'PAID'
  );

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
      const invs = pagedInvoices || [];
      return [
        ...apps.map(a => ({ id: a.appointmentId, type: 'app' })),
        ...invs.map(i => ({ id: i.invoiceId, type: 'inv' }))
      ];
    } else {
      return (pagedInvoices || []).map(i => ({ id: i.invoiceId, type: 'inv' }));
    }
  }, [timeFilter, paginatedFutureAppointments, pagedInvoices]);

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
    const fileName = `1RAD_Financial_Report_${timeFilter}_${isExportingSelected ? 'Selected' : 'All'}_${timestampStr}`;

    // Premium design tokens 
    const HDR_BG = 'FF1E293B'; // Dark slate header
    const TOT_BG = 'FF334155'; // Lighter slate totals
    const ALT_BG = 'FFF8FAFC'; // Off-white alternate rows
    const DEF_FG = 'FF1E293B'; // Near-black body text
    const BDR    = 'FFE2E8F0'; // Light slate border

    const thin    = { style: 'thin',   color: { rgb: BDR } };
    const medium  = { style: 'medium', color: { rgb: 'FF94A3B8' } };
    const borders = { top: thin, bottom: thin, left: thin, right: thin };

    const hdrStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: HDR_BG } },
      font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 10, name: 'Calibri' },
      border: borders,
      alignment: { vertical: 'center' },
    };
    const totStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: TOT_BG } },
      font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11, name: 'Calibri' },
      border: { ...borders, top: medium },
      alignment: { vertical: 'center' },
    };
    const mkRow = (bg, fg) => ({
      fill: { patternType: 'solid', fgColor: { rgb: bg } },
      font: { color: { rgb: fg }, sz: 10, name: 'Calibri' },
      border: borders,
      alignment: { vertical: 'center' },
    });

    const applySheet = (ws, numCols, numDataRows, hasTotalsRow = false) => {
      ws['!rows'] = ws['!rows'] || [];
      for (let C = 0; C < numCols; C++) {
        const ref = XLSX.utils.encode_cell({ c: C, r: 0 });
        if (ws[ref]) ws[ref].s = hdrStyle;
      }
      ws['!rows'][0] = { hpt: 22 };
      for (let R = 1; R <= numDataRows; R++) {
        const bg = R % 2 === 0 ? ALT_BG : 'FFFFFFFF';
        for (let C = 0; C < numCols; C++) {
          const ref = XLSX.utils.encode_cell({ c: C, r: R });
          if (ws[ref]) ws[ref].s = mkRow(bg, DEF_FG);
        }
      }
      if (hasTotalsRow) {
        const totIdx = numDataRows + 1;
        for (let C = 0; C < numCols; C++) {
          const ref = XLSX.utils.encode_cell({ c: C, r: totIdx });
          if (ws[ref]) ws[ref].s = totStyle;
        }
        ws['!rows'][totIdx] = { hpt: 26 };
      }
    };

    const approvalCells = (row) => {
      const a = approvalForInvoice(approvalMap, row);
      if (!a) return ['--', ''];
      const b = approvalBadge(a.status);
      return [b ? b.short : (a.status || '--'), a.reason || ''];
    };

    let totals = { gross: 0, discount: 0, net: 0, cut: 0, income: 0 };

    if (timeFilter === 'FUTURE') {
      headers = [
        'Appointment ID', 'Patient Name', 'Referred By', 'Scheduled For',
        'Modality', 'Service Name', 'Projected Revenue (INR)', 'Estimated Referral Cut (INR)',
        'Estimated Net (INR)', 'Admin Approval', 'Reason'
      ];

      const apps = futureAppointments || [];
      const filteredApps = isExportingSelected 
        ? apps.filter(app => selectedIds.has(app.appointmentId)) 
        : apps;

      filteredApps.forEach(app => {
        const price = getServicePrice(app.service);
        const cut = getServiceCut(app);
        totals.gross += price;
        totals.cut += cut;
        totals.income += (price - cut);
        
        rows.push([
          app.displayId || 'N/A',
          app.patientName || 'UNKNOWN',
          app.referredBy || app.referrerName || 'SELF',
          formatDate(app.date || app.dateTime),
          app.modality || 'US',
          app.service || 'N/A',
          price,
          cut,
          price - cut,
          ...approvalCells(app)
        ]);
      });

      const preBilled = filteredInvoices || [];
      const filteredPreBilled = isExportingSelected 
        ? preBilled.filter(inv => selectedIds.has(inv.invoiceId)) 
        : preBilled;

      filteredPreBilled.forEach(inv => {
        totals.gross += (inv.totalAmount || 0);
        totals.cut += (inv.commissionAmount || 0);
        totals.income += ((inv.totalAmount || 0) - (inv.commissionAmount || 0));

        rows.push([
          inv.displayId || 'N/A',
          inv.patientName || 'UNKNOWN',
          inv.referrerName || 'SELF',
          'PRE-BILLED',
          inv.modality || 'US',
          'MANUAL_INVOICE_LEDGER',
          inv.totalAmount || 0,
          inv.commissionAmount || 0,
          (inv.totalAmount || 0) - (inv.commissionAmount || 0),
          ...approvalCells(inv)
        ]);
      });
      
      rows.push([]);
      rows.push([
        'TOTALS', '', '', '', '', '',
        totals.gross, totals.cut, totals.income, '', ''
      ]);

    } else {
      headers = [
        'Invoice ID', 'Patient Name', 'Referred By', 'Timestamp', 'Modality',
        'Gross Amount (INR)', 'Discount Amount (INR)', 'Net Payable (INR)',
        'Referral Cut (INR)', 'Net Clinic Income (INR)', 'Status', 'Admin Approval', 'Reason'
      ];

      const invoicesToExport = filteredInvoices || [];
      const filteredInvoicesToExport = isExportingSelected 
        ? invoicesToExport.filter(inv => selectedIds.has(inv.invoiceId)) 
        : invoicesToExport;

      filteredInvoicesToExport.forEach(inv => {
        totals.gross += (inv.grossAmount || 0);
        totals.discount += (inv.discountAmount || 0);
        totals.net += (inv.totalAmount || 0);
        totals.cut += (inv.commissionAmount || 0);
        totals.income += ((inv.totalAmount || 0) - (inv.commissionAmount || 0));

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
          inv.status || 'PENDING',
          ...approvalCells(inv)
        ]);
      });

      rows.push([]);
      rows.push([
        'TOTALS', '', '', '', '',
        totals.gross, totals.discount, totals.net, totals.cut, totals.income, '', '', ''
      ]);
    }

    const dataArr = [headers, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dataArr);
    
    // Set column widths
    const wscols = headers.map(() => ({ wch: 18 }));
    wscols[0] = { wch: 14 }; // ID
    wscols[1] = { wch: 22 }; // Name
    wscols[2] = { wch: 22 }; // Referrer
    ws['!cols'] = wscols;

    applySheet(ws, headers.length, rows.length - 2, true);
    
    XLSX.utils.book_append_sheet(wb, ws, "Financial Report");
    XLSX.writeFile(wb, fileName + ".xlsx");
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
               {/* No FUTURE tab — future appointments never carry invoices (a paid
                   visit moved to a future date is refunded + its bill voided), so
                   there's nothing pre-billed to show here. */}
               {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
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
             {/* Quick filter — only invoices awaiting admin approval. */}
             <button
               onClick={() => setApprovalFilter(approvalFilter === 'AWAITING' ? 'ALL' : 'AWAITING')}
               style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '10px', border: '1px solid', borderColor: approvalFilter === 'AWAITING' ? '#7c3aed' : '#e2e8f0', background: approvalFilter === 'AWAITING' ? '#7c3aed' : 'white', color: approvalFilter === 'AWAITING' ? 'white' : '#64748b', fontSize: '9px', fontWeight: 950, letterSpacing: '0.5px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
               ⏳ AWAITING APPROVAL
             </button>
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
                {timeFilter === 'FUTURE' ? ((futureAppointments?.length || 0) + (invoiceTotalCount || 0)) : (invoiceTotalCount || 0)}
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
                 placeholder="Search patient, invoice ID, referred-by, service or modality..."
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
                         <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>GENERATED_AT</th>
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
                      <th onClick={() => handleSort('serviceDate')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>SERVICE_DATE {getSortIcon('serviceDate')}</th>
                      <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>MODALITY : SERVICE</th>
                      <th onClick={() => handleSort('grossAmount')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#1e293b', letterSpacing: '1px', background: '#f8fafc' }}>GROSS {getSortIcon('grossAmount')}</th>
                      <th onClick={() => handleSort('discountAmount')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px', background: '#fff1f2' }}>DISCOUNT {getSortIcon('discountAmount')}</th>
                      <th onClick={() => handleSort('totalAmount')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', background: '#f0f4ff' }}>NET_PAYABLE {getSortIcon('totalAmount')}</th>
                      <th onClick={() => handleSort('commissionAmount')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>CUT {getSortIcon('commissionAmount')}</th>
                      <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#166534', letterSpacing: '1px', background: '#f0fdf4' }}>INCOME</th>
                      <th onClick={() => handleSort('status')} style={{ cursor: 'pointer', padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>STATUS {getSortIcon('status')}</th>
                      <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#7c3aed', letterSpacing: '1px' }}>APPROVAL</th>
                      <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', textAlign: 'right', ...(isMobile ? { position: 'sticky', right: 0, background: 'white', zIndex: 3, boxShadow: '-8px 0 14px -10px rgba(15,23,42,0.18)' } : {}) }}>ACTIONS</th>
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
                        <td style={{ padding: '20px 10px', fontSize: '11px', color: '#0f52ba', fontWeight: 700 }}>{formatDate(app.date || app.dateTime)}</td>
                          <td style={{ padding: '20px 10px', fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>TBD (Future)</td>
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
                    {pagedInvoices.length > 0 && (
                     <tr style={{ background: '#f1f5f9' }}>
                       <td colSpan="10" style={{ padding: '12px 20px', fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px' }}>PRE-BILLED_FUTURE_TRANSACTIONS</td>
                     </tr>
                   )}
                    {pagedInvoices.map(inv => (
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
                 pagedInvoices.map(inv => (
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
                     <td style={{ padding: '20px 10px', fontSize: '11px', color: '#0f52ba', fontWeight: 700 }}>{formatDate(inv?.serviceDate || inv?.createdAt, true)}</td>
                     {/* Modality : Service — one combined column. Each service is
                         grouped under its modality (modality first), one group per
                         line, e.g. "USG: Whole Abdomen, KUB" / "X-RAY: Chest PA".
                         A second modality added post-payment now shows correctly. */}
                     <td style={{ padding: '14px 10px', verticalAlign: 'top' }}>
                       {(() => {
                         const tintFor = (m) => {
                           const k = String(m || '').toUpperCase();
                           return ({
                             'X-RAY':     { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
                             CT:          { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
                             MRI:         { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
                             ULTRASOUND:  { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
                             USG:         { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
                             MAMMOGRAPHY: { bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d' },
                             MG:          { bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d' },
                             DEXA:        { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
                             PET:         { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
                           }[k] || { bg: '#f1f5f9', border: '#e2e8f0', text: '#0f52ba' });
                         };
                         // Group every service line under its modality, first-seen
                         // order preserved, so multi-modality visits read cleanly.
                         const items = inv.items || [];
                         const order = [];
                         const byMod = {};
                         for (const it of items) {
                           const m = (String(it.modality || it.Modality || inv.modality || '').toUpperCase()) || 'OTHER';
                           const name = it.description || it.serviceName || 'Service';
                           const qty = Number(it.quantity) || 1;
                           const label = name + (qty > 1 ? ` ×${qty}` : '');
                           if (!(m in byMod)) { byMod[m] = []; order.push(m); }
                           byMod[m].push(label);
                         }
                         if (order.length === 0) {
                           const m = inv.modality ? String(inv.modality).toUpperCase() : '—';
                           return <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>{m}</span>;
                         }
                         return (
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxWidth: '300px' }}
                                title={order.map(m => `${m}: ${byMod[m].join(', ')}`).join('  •  ')}>
                             {order.map((m, i) => {
                               const t = tintFor(m);
                               return (
                                 <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', lineHeight: 1.3 }}>
                                   <span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: '6px', fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px', color: t.text, background: t.bg, border: `1px solid ${t.border}` }}>{m}</span>
                                   <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#1e293b' }}>{byMod[m].join(', ')}</span>
                                 </div>
                               );
                             })}
                           </div>
                         );
                       })()}
                     </td>
                     <td style={{ padding: '20px 10px', fontSize: '11.5px', fontWeight: 700, color: '#64748b', background: '#f8fafc' }}>₹{(inv.grossAmount || 0).toLocaleString()}</td>
                     <td style={{ padding: '20px 10px', fontSize: '11.5px', fontWeight: 950, color: '#ef4444', background: '#fff1f2' }}>{(inv?.discountAmount || 0) > 0 ? `-₹${(inv.discountAmount || 0).toLocaleString()}` : '₹0'}</td>
                     <td style={{ padding: '20px 10px', fontSize: '12px', fontWeight: 950, color: '#0f52ba', background: '#f0f4ff' }}>₹{(inv?.totalAmount || 0).toLocaleString()}</td>
                     <td style={{ padding: '20px 10px' }}>
                         {(Number(inv?.commissionAmount) || 0) > 0 ? (
                           <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '13px', fontWeight: 950, color: '#e11d48' }}>₹{(Number(inv?.commissionAmount) || 0).toLocaleString()}</span>
                              <span style={{ fontSize: '8px', fontWeight: 800, color: '#e11d48', opacity: 0.7 }}>LOGGED_PAYOUT</span>
                           </div>
                         ) : (
                           <span style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: 900 }}>₹0</span>
                         )}
                     </td>
                     <td style={{ padding: '20px 10px', fontSize: '12px', fontWeight: 950, color: '#166534', background: '#f0fdf4' }}>₹{(Number(inv?.totalAmount || 0) - (Number(inv?.commissionAmount) || 0)).toLocaleString()}</td>
                     <td style={{ padding: '20px 10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span style={{
                            padding: '6px 12px', borderRadius: '8px', fontSize: '8.5px', fontWeight: 950,
                            background: inv?.status === 'PAID' ? '#ecfdf5' : inv?.status === 'CANCELLED' ? '#f1f5f9' : inv?.status === 'PARTIAL' ? '#fffbeb' : '#fff7ed',
                            color: inv?.status === 'PAID' ? '#059669' : inv?.status === 'CANCELLED' ? '#64748b' : inv?.status === 'PARTIAL' ? '#b45309' : '#ea580c'
                          }}>
                            {inv?.status === 'CANCELLED' ? '🚫 CANCELLED' : inv?.status === 'PARTIAL' ? '◐ PARTIAL' : (inv?.status || 'PENDING')}
                          </span>
                          {inv?.status === 'CANCELLED' && (
                            <span style={{ padding: '4px 9px', borderRadius: '7px', fontSize: '8px', fontWeight: 800, background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa', lineHeight: 1.3 }}>Appointment cancelled · refunded · net ₹0</span>
                          )}
                          {inv?.status === 'PARTIAL' && (
                            <span style={{ padding: '4px 9px', borderRadius: '7px', fontSize: '8px', fontWeight: 900, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', lineHeight: 1.3 }}>
                              ₹{(Number(inv?.paidAmount) || 0).toLocaleString()} paid · ₹{Math.max(0, (Number(inv?.totalAmount) || 0) - (Number(inv?.paidAmount) || 0)).toLocaleString()} due
                            </span>
                          )}
                          {inv?.isFree && (
                            <span style={{ padding: '4px 9px', borderRadius: '7px', fontSize: '8px', fontWeight: 950, letterSpacing: '0.5px', background: '#f0fdfa', color: '#0d9488', border: '1px solid #99f6e4' }}>🎁 FREE</span>
                          )}
                          {/* Patient holds an advance (overpayment). Shown bold next to the
                              status; refund it from the view drawer's left panel. */}
                          {(Number(advanceByPatient[String(inv?.patientId)]) || 0) > 0 && (
                            <span style={{ padding: '4px 9px', borderRadius: '7px', fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px', background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>
                              💳 Advance <b style={{ fontWeight: 950 }}>₹{(Number(advanceByPatient[String(inv?.patientId)]) || 0).toLocaleString()}</b>
                            </span>
                          )}
                        </div>
                     </td>
                     {/* Admin-approval status for this invoice (request reason + outcome). */}
                     <td style={{ padding: '20px 10px' }}>
                        {(() => {
                          const ap = approvalForInvoice(approvalMap, inv);
                          const b = ap && approvalBadge(ap.status);
                          if (!ap || !b) return <span style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: 700 }}>—</span>;
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start', maxWidth: '200px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px', borderRadius: '999px', fontSize: '8.5px', fontWeight: 950, letterSpacing: '0.3px', background: b.bg, color: b.color, border: `1px solid ${b.bd}`, whiteSpace: 'nowrap' }}>{b.icon} {b.short}</span>
                              {ap.reason && <span title={ap.reason} style={{ fontSize: '9px', color: '#64748b', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}><b style={{ color: '#94a3b8' }}>Why:</b> {ap.reason}</span>}
                              {ap.status === 'REJECTED' && ap.reviewNote && <span title={ap.reviewNote} style={{ fontSize: '9px', color: '#991b1b', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}><b>Admin:</b> {ap.reviewNote}</span>}
                            </div>
                          );
                        })()}
                     </td>
                     <td style={{ padding: isMobile ? '14px 10px' : '20px 10px', textAlign: 'right', ...(isMobile ? { position: 'sticky', right: 0, background: 'white', zIndex: 2, boxShadow: '-8px 0 14px -10px rgba(15,23,42,0.18)' } : {}) }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: isMobile ? '8px' : '6px' }}>
                        {/* Payment / View — the primary action, pulled OUT of the
                            dropdown so it's always one click (no menu). */}
                        <button
                          onClick={() => { celebrate(); setSelectedInvoice(inv); setIsInvoiceDrawerOpen(true); }}
                          title={inv.status === 'CANCELLED' ? 'View cancelled invoice' : inv.status === 'PAID' ? 'View invoice' : 'Record payment'}
                          style={{ padding: isMobile ? '11px 18px' : '8px 14px', minHeight: isMobile ? '42px' : undefined, borderRadius: '10px', border: (inv.status === 'PAID' || inv.status === 'CANCELLED') ? '1px solid #cbd5e1' : 'none', background: (inv.status === 'PAID' || inv.status === 'CANCELLED') ? 'white' : 'linear-gradient(135deg,#0f52ba,#1d4ed8)', color: (inv.status === 'PAID' || inv.status === 'CANCELLED') ? '#475569' : 'white', fontSize: isMobile ? '11px' : '9px', fontWeight: 950, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: (inv.status === 'PAID' || inv.status === 'CANCELLED') ? '0 1px 3px rgba(0,0,0,0.06)' : '0 4px 12px -3px rgba(15,82,186,0.45)' }}
                        >{(inv.status === 'PAID' || inv.status === 'CANCELLED') ? 'VIEW' : 'PAYMENT'}</button>
                        <RowActionsMenu isMobile={isMobile}>
                         {/* Invoice — printable BEFORE and after payment (a proforma /
                             estimate to hand the patient, then the final bill). The
                             receipts below require a recorded payment — you can't receipt
                             money that hasn't been collected. */}
                         <button
                           onClick={() => { celebrate(); handlePrintA4(inv); }}
                           title="Print invoice"
                           style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #0f52ba', background: 'white', color: '#0f52ba', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                         >Invoice</button>
                         {inv?.status === 'PAID' && (
                           <>
                             <button
                               onClick={() => { celebrate(); handlePrintThermal(inv); }}
                               title="Print Thermal Receipt"
                               style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                             >Thermal Receipt</button>
                             <button
                               onClick={() => { celebrate(); handlePrintReceipt(inv); }}
                               title="Print Payment Receipt"
                               style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #10b981', background: 'white', color: '#10b981', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                             >Receipt</button>
                           </>
                         )}
                         <div style={{ height: '1px', width: '100%', background: '#eef2f7', margin: '2px 0' }}></div>
                        {/* 3) Update payout — sits just before Delete. */}
                        <button
                          onClick={() => {
                             if (isPayoutPaid(inv)) return;   // locked once the referrer is paid
                             celebrate();
                             // Multi-stage referrer identity resolution
                             let refId = inv.referrerId;
                             if (!refId && inv.referrerName) {
                                const match = referrers.find(r => r.name?.toLowerCase() === (inv.referrerName || '').toLowerCase());
                                if (match) refId = match.referrerId || match.id;
                             }

                             if (!refId) {
                                setErrorModal({
                                  isOpen: true,
                                  title: "FISCAL COMPLIANCE WARNING",
                                  message: `Invoice ${inv.displayId} has no referral partner attached. Assign a referrer on the invoice before recording a payout.`
                                });
                                return;
                             }

                             // Build ONE payout line per service on the invoice so a
                             // multi-service visit pays the referrer per modality.
                             const items = inv.items || [];
                             const ref = inv.displayId;
                             const existingForInvoice = (referralCommissions || []).filter(c =>
                               (c.referenceNumber || c.reference) === ref || c.id === inv.commissionId
                             );

                             const lineFromItem = (item) => {
                               const service = serviceRegistry?.find(s => (s.serviceName || s.descriptor)?.toLowerCase() === item.description?.toLowerCase());
                               const modality = String(item.modality || item.Modality || service?.modality || inv.modality || 'MRI').toUpperCase();
                               const registryCut = (service?.referralCutValue || 0) * (item.quantity || 1);
                               // Prefer a previously-saved amount for this modality, else the registry cut.
                               const prior = existingForInvoice.find(c => String(c.modality || '').toUpperCase() === modality);
                               return {
                                 modality,
                                 amount: prior?.amount ?? prior?.payoutAmount ?? (registryCut || ''),
                                 status: prior?.status || prior?.commissionStatus || 'UNPAID',
                                 serviceName: item.description || modality,
                                 appointmentServiceId: item.appointmentServiceId || null,
                                 // Ceiling for the payout edit: a commission may equal but
                                 // never exceed the service charge it was earned on.
                                 serviceAmount: (Number(item.amount) || 0) * (Number(item.quantity) || 1),
                               };
                             };

                             let lines = items.length > 0
                               ? items.map(lineFromItem)
                               : [{
                                   modality: String(inv.modality || 'MRI').toUpperCase(),
                                   amount: inv.commissionAmount || '',
                                   status: 'UNPAID',
                                   serviceName: inv.modality || 'Service',
                                   appointmentServiceId: null,
                                   serviceAmount: Number(inv.totalAmount) || Number(inv.grossAmount) || 0,
                                 }];

                             setEditPayout({
                                commissionId: '',            // batch (per-service) mode
                                referrerId: refId,
                                referrerName: inv.referrerName || 'DIRECT',
                                invoiceId: ref,
                                appointmentId: inv.appointmentId || null,
                                patientName: inv.patientName || '',
                                remarks: `Commission for ${inv.displayId} (${inv.patientName})`,
                                lines,
                             });
                             setIsPayoutDrawerOpen(true);
                          }}
                          disabled={isPayoutPaid(inv)}
                          title={isPayoutPaid(inv) ? 'Referral already paid — to change it, revert via the PAID badge and request admin approval.' : 'Update referral payout'}
                           style={{
                             padding: '6px 10px', borderRadius: '10px', border: 'none',
                             background: isPayoutPaid(inv) ? '#f1f5f9' : '#fff1f2',
                             color: isPayoutPaid(inv) ? '#94a3b8' : '#e11d48',
                             fontSize: '8.5px', fontWeight: 950,
                             cursor: isPayoutPaid(inv) ? 'not-allowed' : 'pointer',
                             boxShadow: isPayoutPaid(inv) ? 'none' : '0 2px 5px rgba(225,29,72,0.1)'
                           }} >{isPayoutPaid(inv) ? '🔒 PAYOUT PAID' : 'UPDATE PAYOUT'}</button>




                        {/* Delete is only for MANUAL invoices. Appointment-linked bills
                            are managed (cancelled) from the Appointment board, so they
                            stay locked here — keeps the bill in lock-step with its study. */}
                        {inv?.status === 'PAID' ? (
                           <span title="Cannot delete a paid invoice" style={{ padding: '6px 10px', borderRadius: '10px', background: '#f1f5f9', color: '#cbd5e1', fontSize: '9px', fontWeight: 950, cursor: 'not-allowed', userSelect: 'none' }}>🔒 LOCKED</span>
                         ) : inv?.appointmentId ? (
                           <span
                             onClick={() => setErrorModal({
                               isOpen: true,
                               title: 'TIED TO AN APPOINTMENT',
                               message: `Invoice ${inv.displayId || 'N/A'} is linked to an appointment, so it can't be deleted here. To remove it, cancel the appointment from the Appointment board — the bill is kept in step with the study.`
                             })}
                             title="Tied to an appointment — cancel it from the Appointment board"
                             style={{ padding: '6px 10px', borderRadius: '10px', background: '#f1f5f9', color: '#cbd5e1', fontSize: '9px', fontWeight: 950, cursor: 'pointer', userSelect: 'none' }}
                           >🔒 LOCKED</span>
                         ) : (
                           <button
                             onClick={() => setDeleteConfirmModal({ isOpen: true, invoiceId: inv.invoiceId, commissionId: inv.commissionId, displayId: inv.displayId || 'N/A' })}
                             title="Delete this manual invoice"
                             style={{ padding: '6px 10px', borderRadius: '10px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                           >DEL</button>
                         )}
                        </RowActionsMenu>
                        </div>
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
                {/* ── Load More / Showing count ────────────────────────────── */}
             {(timeFilter !== 'FUTURE') && (
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0 8px' }}>
                 <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>
                   Showing {pagedInvoices.length} of {invoiceTotalCount} invoices
                 </div>
                 {invoiceHasMore && (
                   <button
                     id="load-more-invoices-btn"
                     onClick={onLoadMoreInvoices}
                     disabled={invoiceLoadingMore}
                     style={{
                       padding: '10px 28px',
                       borderRadius: '12px',
                       border: '1.5px solid #0f52ba',
                       background: invoiceLoadingMore ? '#f1f5f9' : 'white',
                       color: invoiceLoadingMore ? '#94a3b8' : '#0f52ba',
                       fontSize: '12px',
                       fontWeight: 800,
                       cursor: invoiceLoadingMore ? 'default' : 'pointer',
                       display: 'flex',
                       alignItems: 'center',
                       gap: '8px',
                       transition: 'all 0.2s',
                       boxShadow: invoiceLoadingMore ? 'none' : '0 2px 8px rgba(15,82,186,0.12)',
                     }}
                   >
                     {invoiceLoadingMore ? (
                       <>
                         <span style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #0f52ba', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                         Loading…
                       </>
                     ) : (
                       <>
                         <span style={{ fontSize: '14px' }}>↓</span>
                         Load 25 more
                       </>
                     )}
                   </button>
                 )}
               </div>
             )}
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
