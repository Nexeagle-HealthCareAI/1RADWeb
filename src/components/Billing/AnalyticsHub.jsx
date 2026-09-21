import React, { useState, useMemo, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import { fetchFinancialMatrix } from '../../api/billing/reportingApi';
import RevenueCollectionsPanel from './panels/RevenueCollectionsPanel';
import DiscountReferralPanel from './panels/DiscountReferralPanel';
import ModalityPerformancePanel from './panels/ModalityPerformancePanel';
import ServicePerformancePanel from './panels/ServicePerformancePanel';
import PatientReferralTrendsPanel from './panels/PatientReferralTrendsPanel';
import {
  normalizeInvoiceForMatrix,
  buildPaymentModeBreakdown,
  buildAgingBuckets,
  buildRevenueTrend,
  buildRecoveryInsight,
  buildDiscountAllocation,
  buildLeakageTable,
  buildLeakageFromInvoices,
  buildTopRecipients,
  buildServicePerformanceFallback,
  buildPatientAcquisitionFallback,
  buildPhysicianRoiFallback,
} from '../../utils/financialMatrixFallback';

const AnalyticsHub = ({
  isMobile,
  liveStats,
  outflowStats,
  matrix,
  timeFilter,
  setTimeFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  invoices = [],
  expenses = [],
  referrers = [],
  referralCommissions = [],
  appointments = [],
  forceSection = null
}) => {
  // Current active dashboard tab
  const [activeSection, setActiveSection] = useState('REVENUE'); // 'REVENUE', 'DISCOUNTS', 'MODALITIES', 'TRENDS'
  const currentSection = forceSection || activeSection;
  const isEmpty = invoices.length === 0 && expenses.length === 0 && referralCommissions.length === 0;

  const TODAY = new Date().toISOString().split('T')[0];

  const handleExportToExcel = () => {
    if (!modalityGroupedServices.length) return;
    const wb = XLSX.utils.book_new();

    const HDR_BG = 'FF1E293B';
    const TOT_BG = 'FF334155';
    const ALT_BG = 'FFF8FAFC';
    const DEF_FG = 'FF1E293B';
    const BDR    = 'FFE2E8F0';

    const thin    = { style: 'thin',   color: { rgb: BDR } };
    const medium  = { style: 'medium', color: { rgb: 'FF94A3B8' } };
    const borders = { top: thin, bottom: thin, left: thin, right: thin };

    const hdrStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: HDR_BG } },
      font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 10, name: 'Calibri' },
      border: borders,
      alignment: { vertical: 'center', horizontal: 'center' },
    };
    const leftHdrStyle = {
      ...hdrStyle,
      alignment: { vertical: 'center', horizontal: 'left' }
    };
    const totStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: TOT_BG } },
      font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 10, name: 'Calibri' },
      border: { ...borders, top: medium },
      alignment: { vertical: 'center', horizontal: 'center' },
    };
    const leftTotStyle = {
      ...totStyle,
      alignment: { vertical: 'center', horizontal: 'left' }
    };
    const subHdrStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFE2E8F0' } },
      font: { bold: true, color: { rgb: 'FF1E293B' }, sz: 10, name: 'Calibri' },
      border: borders,
      alignment: { vertical: 'center', horizontal: 'left' },
    };
    const mkRow = (bg, fg, bold = false, align = 'center') => ({
      fill: { patternType: 'solid', fgColor: { rgb: bg } },
      font: { color: { rgb: fg }, sz: 10, name: 'Calibri', bold },
      border: borders,
      alignment: { vertical: 'center', horizontal: align },
    });

    const dataRows = [];
    const styleMap = new Map();

    modalityGroupedServices.forEach((modGroup) => {
      const subheaderRowIdx = dataRows.length + 1;
      dataRows.push({
        'Modality': modGroup.modality,
        'Service Name': `MODALITY: ${modGroup.modality}`,
        'Scan Volume': '',
        'Gross Revenue (INR)': '',
        'Discount/Comm (INR)': '',
        'Net Yield (INR)': '',
        'Avg Value (INR)': '',
        'Collection Efficiency': ''
      });
      styleMap.set(subheaderRowIdx, 'SUBHEADER');

      (modGroup.services || []).forEach((svc) => {
        const rowIdx = dataRows.length + 1;
        const gross = Math.round(svc.grossRevenue || 0);
        const cut = Math.round(svc.referralCut || 0);
        const net = Math.round(svc.netRevenue || 0);
        const avgVal = svc.scanCount > 0 ? Math.round(svc.grossRevenue / svc.scanCount) : 0;
        const eff = `${(svc.collectionEfficiency || 0).toFixed(1)}%`;

        dataRows.push({
          'Modality': modGroup.modality,
          'Service Name': svc.serviceName || 'Unknown Service',
          'Scan Volume': svc.scanCount || 0,
          'Gross Revenue (INR)': gross,
          'Discount/Comm (INR)': cut,
          'Net Yield (INR)': net,
          'Avg Value (INR)': avgVal,
          'Collection Efficiency': eff
        });
        styleMap.set(rowIdx, 'DATA');
      });

      const subtotalRowIdx = dataRows.length + 1;
      const modGross = (modGroup.services || []).reduce((s, x) => s + (x.grossRevenue || 0), 0);
      const modNet = (modGroup.services || []).reduce((s, x) => s + (x.netRevenue || 0), 0);
      const modCut = (modGroup.services || []).reduce((s, x) => s + (x.referralCut || 0), 0);
      const modScans = (modGroup.services || []).reduce((s, x) => s + (x.scanCount || 0), 0);
      const modAvg = modScans > 0 ? Math.round(modGross / modScans) : 0;
      const modEff = modGross > 0 ? `${((modNet / modGross) * 100).toFixed(1)}%` : '0.0%';

      dataRows.push({
        'Modality': modGroup.modality,
        'Service Name': `SUBTOTAL — ${modGroup.modality}`,
        'Scan Volume': modScans,
        'Gross Revenue (INR)': Math.round(modGross),
        'Discount/Comm (INR)': Math.round(modCut),
        'Net Yield (INR)': Math.round(modNet),
        'Avg Value (INR)': modAvg,
        'Collection Efficiency': modEff
      });
      styleMap.set(subtotalRowIdx, 'SUBTOTAL');
    });

    const grandTotalRowIdx = dataRows.length + 1;
    const totalGross = allServicesData.reduce((s, x) => s + (x.grossRevenue || 0), 0);
    const totalNet = allServicesData.reduce((s, x) => s + (x.netRevenue || 0), 0);
    const totalCut = allServicesData.reduce((s, x) => s + (x.referralCut || 0), 0);
    const totalScans = allServicesData.reduce((s, x) => s + (x.scanCount || 0), 0);
    const totalAvg = totalScans > 0 ? Math.round(totalGross / totalScans) : 0;
    const totalEff = totalGross > 0 ? `${((totalNet / totalGross) * 100).toFixed(1)}%` : '0.0%';

    dataRows.push({
      'Modality': 'ALL',
      'Service Name': 'GRAND TOTAL',
      'Scan Volume': totalScans,
      'Gross Revenue (INR)': Math.round(totalGross),
      'Discount/Comm (INR)': Math.round(totalCut),
      'Net Yield (INR)': Math.round(totalNet),
      'Avg Value (INR)': totalAvg,
      'Collection Efficiency': totalEff
    });
    styleMap.set(grandTotalRowIdx, 'GRAND_TOTAL');

    const ws = XLSX.utils.json_to_sheet(dataRows);
    const numCols = 8;
    const numRows = dataRows.length;

    ws['!cols'] = [
      { wch: 15 },
      { wch: 35 },
      { wch: 12 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 22 }
    ];

    for (let C = 0; C < numCols; C++) {
      const cellRef = XLSX.utils.encode_cell({ c: C, r: 0 });
      if (ws[cellRef]) {
        ws[cellRef].s = C === 1 ? leftHdrStyle : hdrStyle;
      }
    }

    for (let R = 1; R <= numRows; R++) {
      const type = styleMap.get(R);
      const bg = R % 2 === 0 ? ALT_BG : 'FFFFFFFF';

      for (let C = 0; C < numCols; C++) {
        const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cellRef]) continue;

        const align = C === 1 ? 'left' : 'center';

        if (type === 'SUBHEADER') {
          ws[cellRef].s = subHdrStyle;
        } else if (type === 'SUBTOTAL') {
          ws[cellRef].s = C === 1 ? leftTotStyle : totStyle;
        } else if (type === 'GRAND_TOTAL') {
          ws[cellRef].s = C === 1 ? leftTotStyle : totStyle;
        } else {
          ws[cellRef].s = mkRow(bg, DEF_FG, false, align);
        }
      }
    }

    const summarySheetRows = [
      { Metric: 'Service Performance Summary', Value: '' },
      { Metric: 'Temporal Scope', Value: timeFilter },
      { Metric: 'Start Date', Value: startDate || 'All Time' },
      { Metric: 'End Date', Value: endDate || 'All Time' },
      { Metric: 'Total Modalities', Value: modalityGroupedServices.length },
      { Metric: 'Total Unique Services', Value: allServicesData.length },
      { Metric: 'Total Scans Volume', Value: totalScans },
      { Metric: 'Total Gross Billing', Value: Math.round(totalGross) },
      { Metric: 'Total Yield (Net)', Value: Math.round(totalNet) },
      { Metric: 'Overall Efficiency', Value: totalEff },
      { Metric: 'Exported At', Value: new Date().toLocaleString() }
    ];

    const wsSummary = XLSX.utils.json_to_sheet(summarySheetRows);
    wsSummary['!cols'] = [{ wch: 25 }, { wch: 25 }];

    for (let C = 0; C < 2; C++) {
      const cellRef = XLSX.utils.encode_cell({ c: C, r: 0 });
      if (wsSummary[cellRef]) wsSummary[cellRef].s = hdrStyle;
    }
    for (let R = 1; R < summarySheetRows.length; R++) {
      const bg = R % 2 === 0 ? ALT_BG : 'FFFFFFFF';
      for (let C = 0; C < 2; C++) {
        const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
        if (wsSummary[cellRef]) wsSummary[cellRef].s = mkRow(bg, DEF_FG, R === 1, C === 0 ? 'left' : 'center');
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Services Performance');
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const fname = `Service_Performance_${timeFilter}_${new Date().toISOString().split('T')[0]}.xlsx`;
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // ==========================================
  // 1. DATA HEURISTICS & PRESETS (STUNNING FALLBACKS)
  // ==========================================
  
  // Real-time dynamic invoices parser
  const processedInvoices = useMemo(() => {
    return invoices.map(inv => normalizeInvoiceForMatrix(inv, TODAY));
  }, [invoices]);

  // ==========================================
  // TAB 1: REVENUE & COLLECTIONS CALCULATIONS
  // ==========================================
  const revenueCollectionsData = useMemo(() => {
    // Payment-mode breakdown never actually came from the backend matrix
    // (there's no per-invoice payment-method field in /finance/matrix) — it's
    // always derived from the local invoice cache, online or offline. Used to
    // be two copies of the same block; now one call either way.
    const { paymentModes, totalPaymentVolume } = buildPaymentModeBreakdown(processedInvoices);

    // Check if backend monthly trends exist
    if (matrix && Array.isArray(matrix.monthly)) {
      const chartTrend = matrix.monthly.map(item => ({
        label: item.label,
        billed: item.invoiced,
        collected: item.collected
      })).reverse(); // Past 6 months in chronological order

      const agingBuckets = {
        bucket30: matrix.agingDues?.bucket0To30 || 0,
        bucket60: matrix.agingDues?.bucket31To60 || 0,
        bucket90: matrix.agingDues?.bucket61To90 || 0,
        bucketPlus: matrix.agingDues?.bucket91Plus || 0,
      };

      return { chartTrend, paymentModes, totalPaymentVolume, agingBuckets };
    }

    // Offline fallback — see src/utils/financialMatrixFallback.js, which
    // mirrors TemporalAggregationCalculator/AgingAnalysisCalculator on the backend.
    const chartTrend = buildRevenueTrend(processedInvoices, { includeYear: true });
    const agingBuckets = buildAgingBuckets(processedInvoices);

    return { chartTrend, paymentModes, totalPaymentVolume, agingBuckets };
  }, [processedInvoices, matrix]);

  // Dynamic Heuristic AI Recovery Insight generator
  const recoveryInsight = useMemo(() => {
    return buildRecoveryInsight(revenueCollectionsData.agingBuckets);
  }, [revenueCollectionsData]);

  // ==========================================
  // TAB 2: DISCOUNT & REFERRAL CALCULATIONS
  // ==========================================
  const discountReferralData = useMemo(() => {
    // Backend matrix path (authoritative when online).
    if (matrix && matrix.discountAllocations) {
      const da = matrix.discountAllocations;
      const discounts = {
        CENTRE: da.centre || 0,
        REFERRER: da.referrer || 0,
        INSTITUTIONAL: da.institutional || 0,
        OTHER: da.other || 0
      };
      const totalDiscounts = Object.values(discounts).reduce((a, b) => a + b, 0);
      const topRecipients = (matrix.physicianRoiLedger || [])
        .map(p => ({ name: p.doctorName, amount: p.commissionPaid }))
        .filter(p => p.amount > 0)
        .slice(0, 5);
      const leakageTable = buildLeakageTable((matrix.leakageAudits || []).map(a => ({
        name: a.doctorName, totalDisc: a.totalDiscountApproved, totalBilled: a.totalBilledRevenue
      })));
      return { discounts, totalDiscounts, topRecipients, leakageTable };
    }

    // Offline fallback — mirrors DiscountAllocationCalculator/LeakageAuditCalculator.
    const { discounts, totalDiscounts } = buildDiscountAllocation(processedInvoices);
    const topRecipients = buildTopRecipients(referralCommissions, 5);
    const leakageTable = buildLeakageFromInvoices(processedInvoices, referrers);

    return { discounts, totalDiscounts, topRecipients, leakageTable };
  }, [processedInvoices, referralCommissions, referrers, matrix]);

  // ==========================================
  // TAB 3: SERVICE PERFORMANCE CALCULATIONS
  // ==========================================
  const servicePerformanceData = useMemo(() => {
    if (matrix && Array.isArray(matrix.modalityProfitability)) {
      return matrix.modalityProfitability.map(m => ({
        modality: m.modality,
        gross: m.grossRevenue,
        net: m.netRevenue,
        payout: m.referralCut,
        count: m.scanCount,
        avgRevenue: m.scanCount > 0 ? m.grossRevenue / m.scanCount : 0,
        efficiency: m.collectionEfficiency || m.marginPercentage,
        services: m.services || []
      }));
    }

    // Offline fallback — see buildServicePerformanceFallback's own doc comment
    // for why this necessarily approximates modality via keyword-matching the
    // item description rather than the backend's AppointmentService link.
    return buildServicePerformanceFallback(processedInvoices);
  }, [processedInvoices, matrix]);

  // Keep services grouped by modality (already structured that way from servicePerformanceData)
  const modalityGroupedServices = useMemo(() => {
    return (servicePerformanceData || []).filter(m => (m.services || []).length > 0);
  }, [servicePerformanceData]);

  // Flat sorted list for legacy usage
  const allServicesData = useMemo(() => {
    return (servicePerformanceData || []).flatMap(m =>
      (m.services || []).map(s => ({
        ...s,
        parentModality: m.modality
      }))
    ).sort((a, b) => b.grossRevenue - a.grossRevenue);
  }, [servicePerformanceData]);

  // ── Service Performance: compare-to-prior-period ──────────────────────
  // Only meaningful for a BOUNDED range (TODAY or a CUSTOM start/end) —
  // PAST/ALL have no natural "same-length period right before this one".
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [priorMatrix, setPriorMatrix] = useState(null);
  const [priorLoading, setPriorLoading] = useState(false);
  const canCompare = timeFilter === 'TODAY' || timeFilter === 'CUSTOM';

  const shiftDateStr = (dateStr, days) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  };

  const priorRange = useMemo(() => {
    if (timeFilter === 'TODAY') {
      const y = shiftDateStr(TODAY, -1);
      return { start: y, end: y, label: 'vs yesterday' };
    }
    if (timeFilter === 'CUSTOM' && startDate && endDate) {
      const spanDays = Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000) + 1;
      const priorEnd = shiftDateStr(startDate, -1);
      const priorStart = shiftDateStr(startDate, -spanDays);
      return { start: priorStart, end: priorEnd, label: `vs prior ${spanDays}d` };
    }
    return null;
  }, [timeFilter, startDate, endDate, TODAY]);

  useEffect(() => {
    if (!compareEnabled || currentSection !== 'SERVICES' || !canCompare || !priorRange) {
      setPriorMatrix(null);
      return;
    }
    let alive = true;
    setPriorLoading(true);
    fetchFinancialMatrix({ startDate: priorRange.start, endDate: priorRange.end })
      .then(data => { if (alive) setPriorMatrix(data); })
      .catch(() => { if (alive) setPriorMatrix(null); })
      .finally(() => { if (alive) setPriorLoading(false); });
    return () => { alive = false; };
  }, [compareEnabled, currentSection, canCompare, priorRange]);

  // Same shape as servicePerformanceData, built from the prior-period matrix.
  const priorServiceLookup = useMemo(() => {
    const lookup = new Map();
    if (!priorMatrix || !Array.isArray(priorMatrix.modalityProfitability)) return lookup;
    for (const m of priorMatrix.modalityProfitability) {
      for (const s of (m.services || [])) {
        lookup.set(`${m.modality}|${s.serviceName}`, {
          grossRevenue: s.grossRevenue || 0,
          netRevenue: s.netRevenue || 0,
          scanCount: s.scanCount || 0,
        });
      }
    }
    return lookup;
  }, [priorMatrix]);

  const priorTotals = useMemo(() => {
    let totalServices = 0, totalScans = 0, grossRevenue = 0, netRevenue = 0;
    if (priorMatrix && Array.isArray(priorMatrix.modalityProfitability)) {
      for (const m of priorMatrix.modalityProfitability) {
        for (const s of (m.services || [])) {
          totalServices += 1;
          totalScans += s.scanCount || 0;
          grossRevenue += s.grossRevenue || 0;
          netRevenue += s.netRevenue || 0;
        }
      }
    }
    return { totalServices, totalScans, grossRevenue, netRevenue };
  }, [priorMatrix]);

  const toggleCompare = useCallback(() => setCompareEnabled(v => !v), []);

  // ==========================================
  // TAB 4: PATIENT & REFERRAL TRENDS CALCULATIONS
  // ==========================================
  const patientReferralTrends = useMemo(() => {
    if (matrix && Array.isArray(matrix.patientAcquisitionBreakdown)) {
      const patientBreakdown = matrix.patientAcquisitionBreakdown.map(cohort => ({
        month: cohort.monthLabel,
        newPatients: cohort.newPatientsCount,
        returnPatients: cohort.returningPatientsCount
      }));

      const roiLedger = (matrix.physicianRoiLedger || []).map(p => ({
        name: p.doctorName,
        revenue: p.billedRevenue,
        commission: p.commissionPaid,
        ratio: p.roiMultiplier
      }));

      return { patientBreakdown, roiLedger };
    }

    // Offline fallback — mirrors PatientAcquisitionCalculator/PhysicianRoiCalculator.
    const patientBreakdown = buildPatientAcquisitionFallback(processedInvoices);
    const roiLedger = buildPhysicianRoiFallback(processedInvoices, referralCommissions, referrers);

    return { patientBreakdown, roiLedger };
  }, [processedInvoices, referralCommissions, referrers, matrix]);


  // Curated color pallets
  const paymentColors = { CASH: '#64748b', UPI: '#06b6d4', CARD: '#4f46e5', INSURANCE: '#d97706', TPA: '#e11d48' };
  const discountColors = { CENTRE: '#0f52ba', REFERRER: '#d97706', INSTITUTIONAL: '#8b5cf6', OTHER: '#64748b' };

  return (
    <div className="analytics-main" style={{ animation: 'fadeIn 0.3s' }}>
      
      {/* SCOPE CONTROL PANEL */}
      <div style={{ 
        marginBottom: '25px', 
        background: 'white', 
        padding: isMobile ? '20px' : '20px 30px', 
        borderRadius: isMobile ? '16px' : '24px', 
        border: '1px solid #e2e8f0', 
        boxShadow: '0 4px 20px rgba(0,0,0,0.015)' 
      }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: 950, color: '#1e293b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>1RAD FLOW CLINICAL HEALTH ANALYTICS ENGINE</h3>
                <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', margin: 0 }}>Advanced real-time metrics, leakage tracking, and physician commission auditing</p>
              </div>

              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: '15px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>TEMPORAL SCOPE:</span>
                <div className="filter-tabs" style={{ 
                  display: 'flex', 
                  background: '#f1f5f9', 
                  padding: '4px', 
                  borderRadius: '999px', 
                  border: '1px solid #e2e8f0',
                  width: isMobile ? '100%' : 'auto',
                  overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', gap: '2px'
                }}>
                  <style>{`.filter-tabs::-webkit-scrollbar { display: none; }`}</style>
                    {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
                      <button 
                        key={t}
                        onClick={() => setTimeFilter(t)}
                        style={{ 
                          padding: '8px 16px', borderRadius: '999px', border: 'none', fontSize: '10px', fontWeight: 800,
                          background: timeFilter === t ? '#0f52ba' : 'transparent',
                          color: timeFilter === t ? 'white' : '#64748b',
                          cursor: 'pointer', transition: 'all 0.2s',
                          flex: isMobile ? '1 0 auto' : 'none',
                          whiteSpace: 'nowrap'
                        }}
                      >{t}</button>
                    ))}
                </div>
                {timeFilter === 'CUSTOM' && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '4px',
                    animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)', 
                    width: isMobile ? '100%' : 'auto',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04)'; }}
                  >
                     <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', background: 'white', borderRadius: '8px', padding: '0 8px', border: '1px solid transparent', transition: 'border-color 0.2s' }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}>
                       <span style={{ position: 'absolute', left: '12px', fontSize: '8px', fontWeight: 900, color: '#3b82f6', letterSpacing: '1px', pointerEvents: 'none' }}>FROM</span>
                       <input 
                         type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                         style={{ flex: 1, padding: '10px 10px 10px 42px', border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 800, color: '#1e293b', outline: 'none', cursor: 'pointer', WebkitAppearance: 'none' }}
                       />
                     </div>
                     
                     <div style={{ width: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: 300 }}>
                       →
                     </div>
                     
                     <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', background: 'white', borderRadius: '8px', padding: '0 8px', border: '1px solid transparent', transition: 'border-color 0.2s' }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#ec4899'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}>
                       <span style={{ position: 'absolute', left: '12px', fontSize: '8px', fontWeight: 900, color: '#ec4899', letterSpacing: '1px', pointerEvents: 'none' }}>UNTIL</span>
                       <input 
                         type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                         style={{ flex: 1, padding: '10px 10px 10px 42px', border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 800, color: '#1e293b', outline: 'none', cursor: 'pointer', WebkitAppearance: 'none' }}
                       />
                     </div>
                  </div>
                )}
              </div>
          </div>
      </div>

      {/* CORE CLINICAL TAB SWITCHER */}
      {!forceSection && (
        <div className="filter-tabs" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {[
            { id: 'REVENUE', label: '💰 REVENUE & COLLECTIONS' },
            { id: 'DISCOUNTS', label: '🏷️ DISCOUNT & REFERRAL' },
            { id: 'MODALITIES', label: '📊 MODALITY YIELD' },
            { id: 'TRENDS', label: '👥 PATIENT & REFERRAL TRENDS' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              style={{
                padding: '10px 20px',
                borderRadius: '999px',
                border: 'none',
                fontSize: '10px',
                fontWeight: 950,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.3s',
                background: currentSection === tab.id ? '#0f52ba' : 'transparent',
                color: currentSection === tab.id ? 'white' : '#64748b',
                boxShadow: currentSection === tab.id ? '0 4px 12px rgba(15, 82, 186, 0.15)' : 'none'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* MAIN DYNAMIC PRESENTATION SURFACE */}
      <div style={{ 
        background: 'white', 
        borderRadius: isMobile ? '20px' : '32px', 
        border: '1px solid #e2e8f0', 
        padding: isMobile ? '20px' : '35px', 
        boxShadow: '0 20px 50px rgba(0,0,0,0.025)' 
      }}>
        {isEmpty ? (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            textAlign: 'center', 
            padding: '50px 20px',
            maxWidth: '600px',
            margin: '0 auto',
            animation: 'fadeIn 0.4s ease-out'
          }}>
            {/* Immersive high-tech animated analytics illustration */}
            <div style={{ 
              position: 'relative', 
              width: '120px', 
              height: '120px', 
              marginBottom: '25px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              background: 'radial-gradient(circle, rgba(15, 82, 186, 0.08) 0%, transparent 70%)',
              borderRadius: '50%'
            }}>
              {/* Sleek SVG Bar Chart Loading */}
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#0f52ba" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" strokeWidth="2.5" stroke="#cbd5e1" />
                <line x1="12" y1="20" x2="12" y2="4" strokeWidth="2.5" stroke="#0f52ba" />
                <line x1="6" y1="20" x2="6" y2="14" strokeWidth="2.5" stroke="#60a5fa" />
              </svg>
              <div style={{
                position: 'absolute',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#10b981',
                border: '2.5px solid white',
                bottom: '22px',
                right: '22px',
                boxShadow: '0 2px 10px rgba(16,185,129,0.4)'
              }} />
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 950, color: '#0f172a', margin: '0 0 10px 0', letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
              No Financial Activity Recorded Yet
            </h3>
            
            <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, lineHeight: '1.6', margin: '0 0 25px 0', maxWidth: '460px' }}>
              Welcome to the <span style={{ color: '#0f52ba', fontWeight: 900 }}>1Rad Flow Clinical Analytics Hub</span>. 
              Real-time cash flows, modality yield metrics, discount leakage audits, and physician ROI ledgers will automatically populate here as transactions are registered.
            </p>

            {/* Premium Interactive Quickstart Checklist */}
            <div style={{ 
              width: '100%', 
              background: '#f8fafc', 
              border: '1px solid #e2e8f0', 
              borderRadius: '20px', 
              padding: '20px 24px', 
              textAlign: 'left',
              marginBottom: '25px',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.01)'
            }}>
              <div style={{ fontSize: '9px', fontWeight: 950, color: '#475569', letterSpacing: '1px', marginBottom: '14px', textTransform: 'uppercase' }}>
                🚀 CLINICAL WORKFLOW ONBOARDING:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 950, flexShrink: 0 }}>1</div>
                  <div>
                    <h5 style={{ fontSize: '11px', fontWeight: 900, color: '#1e293b', margin: '0 0 2px 0' }}>Launch Patient Billing</h5>
                    <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, margin: 0 }}>Create a manual invoice or click "Collect" on scheduled clinical appointments.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 950, flexShrink: 0 }}>2</div>
                  <div>
                    <h5 style={{ fontSize: '11px', fontWeight: 900, color: '#1e293b', margin: '0 0 2px 0' }}>Log Modality Operations</h5>
                    <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, margin: 0 }}>Record scanning counts and modal values under your pricing registries to analyze service performance.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 950, flexShrink: 0 }}>3</div>
                  <div>
                    <h5 style={{ fontSize: '11px', fontWeight: 900, color: '#1e293b', margin: '0 0 2px 0' }}>Track Referrer Commissions</h5>
                    <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, margin: 0 }}>Map physician commissions on new scans to start generating ROI multiplier audits automatically.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Call to Action */}
            <div style={{ display: 'flex', gap: '15px' }}>
              <button 
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                style={{
                  background: 'linear-gradient(135deg, #0f52ba 0%, #1e40af 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  fontSize: '10.5px',
                  fontWeight: 950,
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(15, 82, 186, 0.25)',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'none'}
              >
                ➕ Create First Invoice
              </button>
            </div>

          </div>
        ) : (
          <>
            {currentSection === 'REVENUE' && (
              <RevenueCollectionsPanel
                isMobile={isMobile}
                data={revenueCollectionsData}
                paymentColors={paymentColors}
                matrix={matrix}
                recoveryInsight={recoveryInsight}
              />
            )}

            {currentSection === 'DISCOUNTS' && (
              <DiscountReferralPanel
                isMobile={isMobile}
                data={discountReferralData}
                discountColors={discountColors}
              />
            )}

            {currentSection === 'MODALITIES' && (
              <ModalityPerformancePanel servicePerformanceData={servicePerformanceData} />
            )}

            {currentSection === 'SERVICES' && (
              <ServicePerformancePanel
                isMobile={isMobile}
                modalityGroupedServices={modalityGroupedServices}
                allServicesData={allServicesData}
                onExportExcel={handleExportToExcel}
                canCompare={canCompare}
                compareEnabled={compareEnabled}
                onToggleCompare={toggleCompare}
                comparisonLoading={priorLoading}
                comparisonLabel={priorRange?.label || ''}
                priorServiceLookup={priorServiceLookup}
                priorTotals={priorTotals}
              />
            )}

            {currentSection === 'TRENDS' && (
              <PatientReferralTrendsPanel isMobile={isMobile} data={patientReferralTrends} patientLtv={matrix?.patientLtv} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AnalyticsHub;
