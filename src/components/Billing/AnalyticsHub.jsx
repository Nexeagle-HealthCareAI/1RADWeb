import React, { useState, useMemo } from 'react';

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
  appointments = []
}) => {
  // Current active dashboard tab
  const [activeSection, setActiveSection] = useState('REVENUE'); // 'REVENUE', 'DISCOUNTS', 'MODALITIES', 'TRENDS'
  const isEmpty = invoices.length === 0 && expenses.length === 0 && referralCommissions.length === 0;

  // Dynamic interactive tooltip state for charts
  const [hoveredPoint, setHoveredPoint] = useState(null); // { x, y, label, billed, collected, type }
  const [hoveredDonutSegment, setHoveredDonutSegment] = useState(null);

  const TODAY = new Date().toISOString().split('T')[0];

  // ==========================================
  // 1. DATA HEURISTICS & PRESETS (STUNNING FALLBACKS)
  // ==========================================
  
  // Real-time dynamic invoices parser
  const processedInvoices = useMemo(() => {
    return invoices.map(inv => {
      // Canonical date basis: ServiceDate (when the scan happened), with fallbacks.
      const dateStr = inv.serviceDate || inv.createdAt || inv.date || TODAY;
      const amtBilled = inv.grossAmount || 0;
      const amtDiscount = inv.discountAmount || 0;
      const amtPaid = inv.paidAmount || 0;
      // amtNet = post-discount billable amount (what the patient actually owes)
      const amtNet = Number(inv.totalAmount) || Math.max(0, amtBilled - amtDiscount);
      const outstanding = Math.max(0, amtNet - amtPaid);
      return {
        ...inv,
        dateStr,
        amtBilled,
        amtNet,
        amtDiscount,
        amtPaid,
        outstanding,
        ageInDays: Math.floor((Date.now() - new Date(dateStr)) / (1000 * 60 * 60 * 24))
      };
    });
  }, [invoices]);

  // ==========================================
  // TAB 1: REVENUE & COLLECTIONS CALCULATIONS
  // ==========================================
  const revenueCollectionsData = useMemo(() => {
    // Generate last 6 months list
    const monthLabels = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });

    const monthKeys = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // "YYYY-MM"
    });

    // Check if backend monthly trends exist
    if (matrix && Array.isArray(matrix.monthly)) {
      const chartTrend = matrix.monthly.map(item => ({
        label: item.label,
        billed: item.invoiced,
        collected: item.collected
      })).reverse(); // Past 6 months in chronological order

      const bucket30 = matrix.agingDues?.bucket0To30 || 0;
      const bucket60 = matrix.agingDues?.bucket31To60 || 0;
      const bucket90 = matrix.agingDues?.bucket61To90 || 0;
      const bucketPlus = matrix.agingDues?.bucket91Plus || 0;
      const agingBuckets = { bucket30, bucket60, bucket90, bucketPlus };

      // Reconstruct payment modes from live stats or invoices
      const paymentBreakdown = { CASH: 0, UPI: 0, CARD: 0, INSURANCE: 0, TPA: 0 };
      processedInvoices.forEach(inv => {
        const mode = (inv.paymentMethod || 'CASH').toUpperCase();
        const collectedAmt = inv.amtPaid;
        if (paymentBreakdown[mode] !== undefined) paymentBreakdown[mode] += collectedAmt;
        else if (mode.includes('TPA')) paymentBreakdown.TPA += collectedAmt;
        else if (mode.includes('INSUR') || mode.includes('MEDIC')) paymentBreakdown.INSURANCE += collectedAmt;
        else paymentBreakdown.CASH += collectedAmt;
      });
      const finalPaymentModes = paymentBreakdown;
      const totalPaymentVolume = Object.values(finalPaymentModes).reduce((a, b) => a + b, 0);

      return { chartTrend, paymentModes: finalPaymentModes, totalPaymentVolume, agingBuckets };
    }

    // Aggregate billed vs collected per month
    // Uses amtNet (post-discount totalAmount) so chart shows actual invoiced value, not inflated gross
    const aggregated = monthKeys.map((key, idx) => {
      let billed = 0;
      let collected = 0;
      processedInvoices.forEach(inv => {
        if (inv.dateStr.startsWith(key)) {
          billed += inv.amtNet;
          collected += inv.amtPaid;
        }
      });
      return { label: monthLabels[idx], billed, collected, key };
    });

    // Real data only — no synthetic fallback curve. Empty practice => flat zeros.
    const chartTrend = aggregated;

    // Payment Mode realization rates
    const paymentBreakdown = { CASH: 0, UPI: 0, CARD: 0, INSURANCE: 0, TPA: 0 };
    processedInvoices.forEach(inv => {
      const mode = (inv.paymentMethod || 'CASH').toUpperCase();
      const collectedAmt = inv.amtPaid;
      if (paymentBreakdown[mode] !== undefined) paymentBreakdown[mode] += collectedAmt;
      else if (mode.includes('TPA')) paymentBreakdown.TPA += collectedAmt;
      else if (mode.includes('INSUR') || mode.includes('MEDIC')) paymentBreakdown.INSURANCE += collectedAmt;
      else paymentBreakdown.CASH += collectedAmt;
    });

    const finalPaymentModes = paymentBreakdown;
    const totalPaymentVolume = Object.values(finalPaymentModes).reduce((a, b) => a + b, 0);

    // Dues Aging Analysis Buckets
    const agingBuckets = { bucket30: 0, bucket60: 0, bucket90: 0, bucketPlus: 0 };
    processedInvoices.forEach(inv => {
      if (inv.outstanding > 0) {
        if (inv.ageInDays <= 30) agingBuckets.bucket30 += inv.outstanding;
        else if (inv.ageInDays <= 60) agingBuckets.bucket60 += inv.outstanding;
        else if (inv.ageInDays <= 90) agingBuckets.bucket90 += inv.outstanding;
        else agingBuckets.bucketPlus += inv.outstanding;
      }
    });

    return { chartTrend, paymentModes: finalPaymentModes, totalPaymentVolume, agingBuckets };
  }, [processedInvoices, matrix]);

  // Dynamic Heuristic AI Recovery Insight generator
  const recoveryInsight = useMemo(() => {
    const { bucket30, bucket60, bucket90, bucketPlus } = revenueCollectionsData.agingBuckets;
    const totalDues = bucket30 + bucket60 + bucket90 + bucketPlus;
    const riskDues = bucket90 + bucketPlus;
    const riskRatio = totalDues > 0 ? (riskDues / totalDues) * 100 : 0;

    let rating = 'EXCELLENT';
    let riskBadge = '🟢 LOW_RISK';
    let advice = 'Outstanding Realization speed is optimal. Retain active patient settlement loops.';

    if (riskRatio > 35 || bucketPlus > 25000) {
      rating = 'CRITICAL_DELINQUENCY';
      riskBadge = '🔴 CRITICAL_RISK';
      advice = 'High volume in 90+ Day bucket requires immediate recovery action. Establish automated collection alerts and temporarily suspend billing lines for delinquent insurers/TPAs.';
    } else if (riskRatio > 15 || bucket60 > 15000) {
      rating = 'MODERATE_EXPOSURE';
      riskBadge = '🟡 MODERATE_RISK';
      advice = 'Active follow-up is necessary for the 31-90 Day bucket. Advise reception nodes to confirm UPI and copay parameters before launching subsequent scans.';
    }

    return { totalDues, riskRatio, rating, riskBadge, advice };
  }, [revenueCollectionsData]);

  // ==========================================
  // TAB 2: DISCOUNT & REFERRAL CALCULATIONS
  // ==========================================
  const discountReferralData = useMemo(() => {
    // Discounts are split by the REAL deduction vectors recorded on the invoice
    // (Centre / Referrer / Institutional / Other) — no guessing from patient name,
    // and no hardcoded demo values. Empty practice => zeros (true empty state).
    const buildLeakage = (rows) => rows
      .map(r => {
        const avgRate = r.totalBilled > 0 ? (r.totalDisc / r.totalBilled) * 100 : 0;
        let badge = '🟢 NORMAL', color = '#059669';
        if (avgRate > 20) { badge = '🔴 HIGH RISK'; color = '#dc2626'; }
        else if (avgRate > 10) { badge = '🟡 REVIEW'; color = '#d97706'; }
        return { name: r.name, avgRate, totalDisc: r.totalDisc, totalBilled: r.totalBilled, badge, color };
      })
      .sort((a, b) => b.avgRate - a.avgRate);

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
      const leakageTable = buildLeakage((matrix.leakageAudits || []).map(a => ({
        name: a.doctorName, totalDisc: a.totalDiscountApproved, totalBilled: a.totalBilledRevenue
      })));
      return { discounts, totalDiscounts, topRecipients, leakageTable };
    }

    // Offline / fallback path computed from cached invoices using the real vectors.
    const discounts = { CENTRE: 0, REFERRER: 0, INSTITUTIONAL: 0, OTHER: 0 };
    processedInvoices.forEach(inv => {
      const centre = Number(inv.centreDiscount) || 0;
      const referrer = Number(inv.referrerDiscount) || 0;
      const institutional = Number(inv.institutionalDeduction) || 0;
      const total = Number(inv.amtDiscount) || 0;
      discounts.CENTRE += centre;
      discounts.REFERRER += referrer;
      discounts.INSTITUTIONAL += institutional;
      discounts.OTHER += Math.max(0, total - (centre + referrer + institutional));
    });
    const totalDiscounts = Object.values(discounts).reduce((a, b) => a + b, 0);

    const refEarnings = {};
    referralCommissions.forEach(comm => {
      const ref = comm.referrerName || 'UNKNOWN REFERRER';
      refEarnings[ref] = (refEarnings[ref] || 0) + (comm.commissionAmount || 0);
    });
    const topRecipients = Object.entries(refEarnings)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const docDiscounts = {};
    processedInvoices.forEach(inv => {
      if (inv.referrerId) {
        const refName = inv.referrerName || referrers.find(r => r.referrerId === inv.referrerId)?.name || 'Referrer';
        if (!docDiscounts[refName]) docDiscounts[refName] = { totalBilled: 0, totalDisc: 0 };
        docDiscounts[refName].totalBilled += inv.amtBilled;
        docDiscounts[refName].totalDisc += inv.amtDiscount;
      }
    });
    const leakageTable = buildLeakage(
      Object.entries(docDiscounts).map(([name, s]) => ({ name, totalDisc: s.totalDisc, totalBilled: s.totalBilled }))
    );

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

    // Gross vs net revenue per modality
    const modalities = ['MRI', 'CT', 'X-RAY', 'ULTRASOUND', 'PET', 'MAMMOGRAPHY', 'FLUOROSCOPY'];
    const performanceMap = {};
    [...modalities, 'OTHER'].forEach(m => performanceMap[m] = { gross: 0, discount: 0, net: 0, count: 0, servicesMap: {} });

    processedInvoices.forEach(inv => {
      inv.items?.forEach(item => {
        const desc = (item.description || '').toUpperCase();
        let matched = null;
        for (const m of modalities) {
          if (desc.includes(m) || desc.includes(m.replace('-', ' '))) {
            matched = m;
            break;
          }
        }
        if (!matched) {
          matched = 'OTHER';
        }
        const itemAmt = item.amount || 0;
        const discRatio = inv.amtBilled > 0 ? (inv.amtDiscount / inv.amtBilled) : 0;
        const itemDisc = itemAmt * discRatio;
        const itemNet = itemAmt - itemDisc;

        performanceMap[matched].gross += itemAmt;
        performanceMap[matched].discount += itemDisc;
        performanceMap[matched].net += itemNet;
        performanceMap[matched].count += 1;

        if (!performanceMap[matched].servicesMap[desc]) {
           performanceMap[matched].servicesMap[desc] = { serviceName: desc, grossRevenue: 0, referralCut: 0, netRevenue: 0, scanCount: 0, collectionEfficiency: 100 };
        }
        performanceMap[matched].servicesMap[desc].grossRevenue += itemAmt;
        performanceMap[matched].servicesMap[desc].referralCut += itemDisc;
        performanceMap[matched].servicesMap[desc].netRevenue += itemNet;
        performanceMap[matched].servicesMap[desc].scanCount += 1;
      });
    });

    const hasPerfData = Object.values(performanceMap).some(v => v.gross > 0);
    const finalPerformance = hasPerfData ? Object.entries(performanceMap).map(([modality, stats]) => ({
      modality,
      gross: stats.gross,
      net: stats.net,
      payout: stats.discount,
      count: stats.count,
      avgRevenue: stats.count > 0 ? stats.gross / stats.count : 0,
      efficiency: stats.gross > 0 ? (stats.net / stats.gross) * 100 : 0,
      services: Object.values(stats.servicesMap).sort((a,b) => b.grossRevenue - a.grossRevenue)
    })) : [];

    return finalPerformance;
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

    // 1. Stacked new vs returning patient density
    const monthLabels = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return d.toLocaleDateString('en-US', { month: 'short' });
    });

    const monthKeys = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    // Exact new-vs-returning (no 65/35 estimate): a patient is "new" in the month
    // of their first-ever service and "returning" in any later month. Distinct
    // patients per month, keyed by serviceDate (via dateStr).
    const firstMonthByPatient = {};
    processedInvoices.forEach(inv => {
      const month = (inv.dateStr || '').slice(0, 7); // YYYY-MM
      if (!month) return;
      const pid = inv.patientId || inv.patientName || inv.id;
      if (!pid) return;
      if (!firstMonthByPatient[pid] || month < firstMonthByPatient[pid]) firstMonthByPatient[pid] = month;
    });

    const patientBreakdown = monthKeys.map((key, idx) => {
      const seen = new Set();
      let newPatients = 0;
      let returnPatients = 0;
      processedInvoices.forEach(inv => {
        if ((inv.dateStr || '').slice(0, 7) !== key) return;
        const pid = inv.patientId || inv.patientName || inv.id;
        if (!pid || seen.has(pid)) return;
        seen.add(pid);
        if (firstMonthByPatient[pid] === key) newPatients++;
        else returnPatients++;
      });
      return { month: monthLabels[idx], newPatients, returnPatients };
    });

    // 2. Top referring doctors ranked by revenue
    const doctorRevenue = {};
    const doctorCommissions = {};
    processedInvoices.forEach(inv => {
      if (inv.referrerId) {
        const refName = inv.referrerName || referrers.find(r => r.referrerId === inv.referrerId)?.name || 'Dr. Guest';
        doctorRevenue[refName] = (doctorRevenue[refName] || 0) + inv.amtBilled;
      }
    });

    referralCommissions.forEach(comm => {
      const ref = comm.referrerName || 'UNKNOWN REFERRER';
      doctorCommissions[ref] = (doctorCommissions[ref] || 0) + (comm.commissionAmount || 0);
    });

    const hasTrends = Object.keys(doctorRevenue).length > 0;
    const roiLedger = hasTrends ? Object.entries(doctorRevenue).map(([name, rev]) => {
      const comm = doctorCommissions[name] || 0;
      const ratio = comm > 0 ? rev / comm : rev > 0 ? Infinity : 0;
      return { name, revenue: rev, commission: comm, ratio };
    }).sort((a, b) => b.revenue - a.revenue) : [];

    return { patientBreakdown, roiLedger };
  }, [processedInvoices, referralCommissions, referrers, matrix]);


  // ==========================================
  // SVG LINE CHART GENERATION HELPER
  // ==========================================
  const drawLineChart = () => {
    const data = revenueCollectionsData.chartTrend;
    const width = 600;
    const height = 220;
    const paddingX = 60;
    const paddingY = 40;

    const chartWidth = width - paddingX - 30;
    const chartHeight = height - paddingY - 20;

    const maxVal = Math.max(...data.map(d => Math.max(d.billed, d.collected)), 50000);
    
    // Compute X, Y coordinates
    const pointsBilled = data.map((d, i) => {
      const x = paddingX + (i * chartWidth) / (data.length - 1);
      const y = paddingY + chartHeight - (d.billed * chartHeight) / maxVal;
      return { x, y, val: d.billed, label: d.label, type: 'Billed' };
    });

    const pointsCollected = data.map((d, i) => {
      const x = paddingX + (i * chartWidth) / (data.length - 1);
      const y = paddingY + chartHeight - (d.collected * chartHeight) / maxVal;
      return { x, y, val: d.collected, label: d.label, type: 'Collected' };
    });

    const pathBilled = `M ${pointsBilled.map(p => `${p.x},${p.y}`).join(' L ')}`;
    const pathCollected = `M ${pointsCollected.map(p => `${p.x},${p.y}`).join(' L ')}`;

    // Draw grid horizontal lines
    const gridTicks = 4;
    const gridLines = Array.from({ length: gridTicks }).map((_, idx) => {
      const y = paddingY + (idx * chartHeight) / (gridTicks - 1);
      const val = Math.round(maxVal - (idx * maxVal) / (gridTicks - 1));
      return { y, val };
    });

    return (
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: '500px', height: 'auto', display: 'block' }}>
          {/* Grids and grid lines */}
          {gridLines.map((line, idx) => (
            <g key={idx}>
              <line 
                x1={paddingX} 
                y1={line.y} 
                x2={width - 20} 
                y2={line.y} 
                stroke="#f1f5f9" 
                strokeWidth={1.5} 
                strokeDasharray="4,4" 
              />
              {/* Y-axis Ticks */}
              <line 
                x1={paddingX - 5} 
                y1={line.y} 
                x2={paddingX} 
                y2={line.y} 
                stroke="#cbd5e1" 
                strokeWidth={1.5} 
              />
              <text 
                x={paddingX - 12} 
                y={line.y + 3} 
                fill="#64748b" 
                fontSize="10px" 
                fontWeight="800" 
                textAnchor="end"
              >
                ₹{line.val >= 100000 
                  ? `${(line.val / 100000).toFixed(1).replace(/\.0$/, '')}L` 
                  : line.val >= 1000 
                  ? `${(line.val / 1000).toFixed(1).replace(/\.0$/, '')}k` 
                  : line.val}
              </text>
            </g>
          ))}

          {/* Month labels and X-axis Ticks */}
          {data.map((d, i) => {
            const x = paddingX + (i * chartWidth) / (data.length - 1);
            return (
              <g key={i}>
                <line 
                  x1={x} 
                  y1={paddingY + chartHeight} 
                  x2={x} 
                  y2={paddingY + chartHeight + 5} 
                  stroke="#cbd5e1" 
                  strokeWidth={1.5} 
                />
                <text 
                  x={x} 
                  y={paddingY + chartHeight + 18} 
                  fill="#64748b" 
                  fontSize="10px" 
                  fontWeight="900" 
                  textAnchor="middle"
                >
                  {d.label}
                </text>
              </g>
            );
          })}

          {/* Solid axis border lines */}
          {/* Solid Y-Axis line */}
          <line 
            x1={paddingX} 
            y1={paddingY - 10} 
            x2={paddingX} 
            y2={paddingY + chartHeight} 
            stroke="#cbd5e1" 
            strokeWidth={1.5} 
          />
          {/* Solid X-Axis line */}
          <line 
            x1={paddingX} 
            y1={paddingY + chartHeight} 
            x2={width - 20} 
            y2={paddingY + chartHeight} 
            stroke="#cbd5e1" 
            strokeWidth={1.5} 
          />

          {/* Lines */}
          <path 
            d={pathBilled} 
            fill="none" 
            stroke="#0f52ba" 
            strokeWidth={3} 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          <path 
            d={pathCollected} 
            fill="none" 
            stroke="#10b981" 
            strokeWidth={3} 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />

          {/* Interactivity Dots */}
          {pointsBilled.map((p, i) => (
            <circle 
              key={`b-${i}`} 
              cx={p.x} 
              cy={p.y} 
              r={hoveredPoint?.idx === i && hoveredPoint?.type === 'Billed' ? 7 : 5} 
              fill="#0f52ba" 
              stroke="white" 
              strokeWidth={2}
              style={{ cursor: 'pointer', transition: 'r 0.2s' }}
              onMouseEnter={() => setHoveredPoint({ ...p, idx: i, otherVal: pointsCollected[i].val })}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          ))}

          {pointsCollected.map((p, i) => (
            <circle 
              key={`c-${i}`} 
              cx={p.x} 
              cy={p.y} 
              r={hoveredPoint?.idx === i && hoveredPoint?.type === 'Collected' ? 7 : 5} 
              fill="#10b981" 
              stroke="white" 
              strokeWidth={2}
              style={{ cursor: 'pointer', transition: 'r 0.2s' }}
              onMouseEnter={() => setHoveredPoint({ ...p, idx: i, otherVal: pointsBilled[i].val })}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          ))}
        </svg>

        {/* Floating Glassmorphic Tooltip */}
        {hoveredPoint && (() => {
          const billedVal = hoveredPoint.type === 'Billed' ? hoveredPoint.val : hoveredPoint.otherVal;
          const collectedVal = hoveredPoint.type === 'Collected' ? hoveredPoint.val : hoveredPoint.otherVal;
          const outstandingVal = Math.max(0, billedVal - collectedVal);
          const realizationPct = billedVal > 0 ? ((collectedVal / billedVal) * 100).toFixed(1) : '0.0';

          return (
            <div style={{
              position: 'absolute',
              top: `${hoveredPoint.y - 100}px`,
              left: `${hoveredPoint.x - 85}px`,
              background: 'rgba(15, 23, 42, 0.96)',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '12px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.12)',
              zIndex: 100,
              pointerEvents: 'none',
              fontSize: '11px',
              fontWeight: 800,
              animation: 'fadeIn 0.15s ease-out'
            }}>
              <div style={{ color: '#94a3b8', fontSize: '9px', fontWeight: 900, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {hoveredPoint.label} REALIZATIONS
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f52ba' }} />
                <span>BILLED: <b style={{ color: '#60a5fa' }}>₹{billedVal.toLocaleString()}</b></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                <span>COLLECTED: <b style={{ color: '#34d399' }}>₹{collectedVal.toLocaleString()}</b></span>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '9px' }}>REALIZATION RATE:</span>
                  <span style={{ color: '#34d399', fontWeight: 900 }}>{realizationPct}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '9px' }}>OUTSTANDING DUES:</span>
                  <span style={{ color: '#f87171', fontWeight: 900 }}>₹{outstandingVal.toLocaleString()}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  // ==========================================
  // SVG DONUT CHART GENERATION HELPER
  // ==========================================
  const drawDonutChart = (dataBreakdown, colorMap) => {
    const entries = Object.entries(dataBreakdown).filter(([_, val]) => val > 0);
    const total = entries.reduce((acc, [_, val]) => acc + val, 0);

    const size = 180;
    const center = size / 2;
    const radius = 60;
    const strokeWidth = 16;
    const circumference = 2 * Math.PI * radius;

    let accumulatedPercentage = 0;

    return (
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle 
            cx={center} 
            cy={center} 
            r={radius} 
            fill="transparent" 
            stroke="#f1f5f9" 
            strokeWidth={strokeWidth} 
          />
          {entries.map(([key, val], idx) => {
            const percentage = (val / total) * 100;
            const strokeDashoffset = circumference - (percentage / 100) * circumference;
            const rotation = (accumulatedPercentage / 100) * 360;
            accumulatedPercentage += percentage;

            const isHovered = hoveredDonutSegment === key;

            return (
              <circle
                key={idx}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={colorMap[key] || '#cbd5e1'}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform={`rotate(${rotation - 90} ${center} ${center})`}
                style={{ 
                  cursor: 'pointer', 
                  transition: 'stroke-width 0.2s, stroke 0.2s',
                  transformOrigin: 'center'
                }}
                onMouseEnter={() => setHoveredDonutSegment(key)}
                onMouseLeave={() => setHoveredDonutSegment(null)}
              />
            );
          })}
        </svg>

        {/* Central Overlay Summary */}
        <div style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          {hoveredDonutSegment ? (
            <>
              <span style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>
                {hoveredDonutSegment}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 950, color: colorMap[hoveredDonutSegment] }}>
                ₹{dataBreakdown[hoveredDonutSegment].toLocaleString()}
              </span>
              <span style={{ fontSize: '8px', fontWeight: 900, color: '#64748b' }}>
                {((dataBreakdown[hoveredDonutSegment] / total) * 100).toFixed(1)}% SHARE
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.5px' }}>
                TOTAL VALUE
              </span>
              <span style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b' }}>
                ₹{total.toLocaleString()}
              </span>
              <span style={{ fontSize: '8px', fontWeight: 800, color: '#64748b' }}>
                {entries.length} SEGMENTS
              </span>
            </>
          )}
        </div>
      </div>
    );
  };

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
                <h3 style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: 950, color: '#1e293b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>1RAD CLINICAL HEALTH ANALYTICS ENGINE</h3>
                <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', margin: 0 }}>Advanced real-time metrics, leakage tracking, and physician commission auditing</p>
              </div>

              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: '15px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>TEMPORAL SCOPE:</span>
                <div style={{ 
                  display: 'flex', 
                  background: '#f1f5f9', 
                  padding: '3px', 
                  borderRadius: '10px', 
                  border: '1px solid #e2e8f0',
                  width: isMobile ? '100%' : 'auto'
                }}>
                    {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
                      <button 
                        key={t}
                        onClick={() => setTimeFilter(t)}
                        style={{ 
                          padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                          background: timeFilter === t ? '#0f52ba' : 'transparent',
                          color: timeFilter === t ? 'white' : '#64748b',
                          cursor: 'pointer', transition: 'all 0.2s',
                          flex: isMobile ? 1 : 'none',
                          whiteSpace: 'nowrap'
                        }}
                      >{t}</button>
                    ))}
                </div>
                {timeFilter === 'CUSTOM' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
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
      </div>

      {/* CORE CLINICAL TAB SWITCHER */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px' }}>
        {[
          { id: 'REVENUE', label: '💰 REVENUE & COLLECTIONS' },
          { id: 'DISCOUNTS', label: '🏷️ DISCOUNT & REFERRAL' },
          { id: 'MODALITIES', label: '🔬 MODALITY PERFORMANCE' },
          { id: 'SERVICES', label: '📊 SERVICE PERFORMANCE' },
          { id: 'TRENDS', label: '👥 PATIENT & REFERRAL TRENDS' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            style={{
              padding: '10px 20px',
              borderRadius: '12px',
              border: 'none',
              fontSize: '10px',
              fontWeight: 950,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.3s',
              background: activeSection === tab.id ? '#0f52ba' : 'transparent',
              color: activeSection === tab.id ? 'white' : '#64748b',
              boxShadow: activeSection === tab.id ? '0 4px 12px rgba(15, 82, 186, 0.15)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
              Welcome to the <span style={{ color: '#0f52ba', fontWeight: 900 }}>1Rad Clinical Analytics Hub</span>. 
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
            {/* ======================================================== */}
            {/* DASHBOARD 1: REVENUE & COLLECTIONS */}
            {/* ======================================================== */}
            {activeSection === 'REVENUE' && (
              <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '30px' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.7fr 1fr', gap: '30px' }}>
                  {/* Line Chart Card */}
                  <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0 }}>MONTHLY BILLED VS COLLECTED WORKLOAD</h4>
                        <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', margin: 0 }}>Comparison of raw clinical billing volume vs realized cash inflows</p>
                      </div>
                      {/* Legend */}
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f52ba' }} /> BILLED
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} /> COLLECTED
                        </div>
                      </div>
                    </div>
                    {drawLineChart()}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: isMobile ? 'column' : 'row',
                      gap: '12px', 
                      marginTop: '20px', 
                      paddingTop: '18px', 
                      borderTop: '1px solid #e2e8f0' 
                    }}>
                      <div style={{ flex: 1, background: 'white', padding: '12px 14px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f52ba', flexShrink: 0 }} />
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, lineHeight: '1.4' }}>
                          <strong style={{ color: '#1e293b' }}>Billed</strong> is the total scan work performed/invoiced.
                        </span>
                      </div>
                      <div style={{ flex: 1, background: 'white', padding: '12px 14px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, lineHeight: '1.4' }}>
                          <strong style={{ color: '#1e293b' }}>Collected</strong> is the actual cash/UPI received in the bank.
                        </span>
                      </div>
                      <div style={{ flex: 1, background: 'white', padding: '12px 14px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f87171', flexShrink: 0 }} />
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, lineHeight: '1.4' }}>
                          The <strong style={{ color: '#1e293b' }}>Gap</strong> shows outstanding insurer claims or pending co-pays.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Donut Card */}
                  <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '100%', marginBottom: '15px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, textAlign: 'center' }}>PAYMENT METHOD REALIZATION</h4>
                      <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', margin: 0, textAlign: 'center' }}>Cash flow distribution across modes</p>
                    </div>
                    
                    {drawDonutChart(revenueCollectionsData.paymentModes, paymentColors)}
                    
                    {/* Custom grid legend list */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', width: '100%', marginTop: '20px' }}>
                      {Object.entries(revenueCollectionsData.paymentModes).map(([key, val]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '8px 12px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: paymentColors[key], flexShrink: 0 }} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8' }}>{key}</span>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b' }}>₹{val.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Advances reconcile the screen: money settled from a patient's
                        earlier advance is NOT fresh cash, so it's shown separately
                        and excluded from the cash channels above. */}
                    {Number(matrix?.collectionChannels?.advanceAmount) > 0 && (
                      <div style={{ marginTop: '12px', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '9px 12px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 900, color: '#1e3a8a' }}>💳 SETTLED FROM ADVANCES</span>
                          <span style={{ fontSize: '11px', fontWeight: 950, color: '#1d4ed8' }}>₹{Number(matrix.collectionChannels.advanceAmount).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8', marginTop: '5px', textAlign: 'center' }}>Paid from a patient&apos;s earlier advance — excluded from cash collected.</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Aging and Recovery AI Card */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.7fr 1fr', gap: '30px' }}>
                  {/* Aging brackets Grid */}
                  <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '15px' }}>ACCOUNTS RECEIVABLE AGING ANALYSIS</h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '15px' }}>
                      {[
                        { label: '0–30 DAYS (NORMAL)', val: revenueCollectionsData.agingBuckets.bucket30, risk: '🟢 LOW RISK', color: '#059669', bg: '#f0fdf4', border: '#dcfce7' },
                        { label: '31–60 DAYS (FOLLOW-UP)', val: revenueCollectionsData.agingBuckets.bucket60, risk: '🟡 MODERATE', color: '#d97706', bg: '#fffbeb', border: '#fef3c7' },
                        { label: '61–90 DAYS (ACTION)', val: revenueCollectionsData.agingBuckets.bucket90, risk: '🟠 SIGNIFICANT', color: '#ea580c', bg: '#fff7ed', border: '#ffedd5' },
                        { label: '90+ DAYS (DELINQUENT)', val: revenueCollectionsData.agingBuckets.bucketPlus, risk: '🔴 CRITICAL', color: '#dc2626', bg: '#fff5f5', border: '#fed7d7' }
                      ].map((bucket, idx) => (
                        <div key={idx} style={{ background: bucket.bg, border: `1px solid ${bucket.border}`, padding: '16px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '8px', fontWeight: 950, color: bucket.color, letterSpacing: '0.5px' }}>{bucket.label}</span>
                          <span style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b' }}>₹{bucket.val.toLocaleString()}</span>
                          <span style={{ fontSize: '9px', fontWeight: 900, color: bucket.color }}>{bucket.risk}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Recovery Panel */}
                  <div style={{ 
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', 
                    padding: '25px', 
                    borderRadius: '24px', 
                    color: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)'
                  }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px' }}>AI Outstanding Realization Analyst</span>
                        <span style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#38bdf8', padding: '3px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 950 }}>
                          HEALTH SCORE: {(100 - recoveryInsight.riskRatio).toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 900, color: '#38bdf8', marginBottom: '8px' }}>
                        STATUS: {recoveryInsight.riskBadge}
                      </div>
                      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', lineHeight: '1.6', fontWeight: 700, margin: 0 }}>
                        {recoveryInsight.advice}
                      </p>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px', marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>TOTAL DUES realization OUTSTANDING</span>
                        <span style={{ fontSize: '14px', fontWeight: 950, color: '#f87171' }}>₹{recoveryInsight.totalDues.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CRITICAL EXPOSURE RATIO</span>
                        <span style={{ fontSize: '14px', fontWeight: 950, color: '#f87171' }}>{recoveryInsight.riskRatio.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ======================================================== */}
            {/* DASHBOARD 2: DISCOUNT & REFERRAL */}
            {/* ======================================================== */}
            {activeSection === 'DISCOUNTS' && (
              <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '30px' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', gap: '30px' }}>
                  {/* Discount Donut Allocation */}
                  <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '100%', marginBottom: '15px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, textAlign: 'center' }}>DISCOUNT & CONCESSION LEAKAGE ALLOCATION</h4>
                      <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', margin: 0, textAlign: 'center' }}>Distribution of approved patient margin cuts by categories</p>
                    </div>

                    {drawDonutChart(discountReferralData.discounts, discountColors)}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', width: '100%', marginTop: '20px' }}>
                      {Object.entries(discountReferralData.discounts).map(([key, val]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '8px 12px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: discountColors[key], flexShrink: 0 }} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8' }}>{key}</span>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b' }}>₹{val.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Horizontal Payout Bar Chart */}
                  <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '20px' }}>TOP REFERRING PHYSICIAN COMMISSION BALANCE</h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {discountReferralData.topRecipients.map((ref, idx) => {
                        const maxRecip = Math.max(...discountReferralData.topRecipients.map(r => r.amount), 1000);
                        const pct = (ref.amount / maxRecip) * 100;
                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b' }}>{ref.name}</span>
                              <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>₹{ref.amount.toLocaleString()}</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #0f52ba, #3b82f6)', borderRadius: '10px', transition: 'width 0.5s ease-out' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Auditor discount leakage table */}
                <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '5px' }}>CONCESSION & MARGIN AUDITOR DIRECTORY</h4>
                  <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginBottom: '20px' }}>Real-time leakage detector tracking doctors approving or receiving above-average margin discounts</p>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left' }}>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>DOCTOR</th>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textAlign: 'center' }}>AVG DISCOUNT (%)</th>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>TOTAL DISCOUNTRealized (₹)</th>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>TOTAL BILLED WORKLOAD (₹)</th>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textAlign: 'right' }}>AUDITOR STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discountReferralData.leakageTable.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '15px', fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{row.name}</td>
                            <td style={{ padding: '15px', fontSize: '11px', fontWeight: 950, color: row.color, textAlign: 'center' }}>{row.avgRate.toFixed(1)}%</td>
                            <td style={{ padding: '15px', fontSize: '11px', fontWeight: 800, color: '#475569' }}>₹{row.totalDisc.toLocaleString()}</td>
                            <td style={{ padding: '15px', fontSize: '11px', fontWeight: 800, color: '#475569' }}>₹{row.totalBilled.toLocaleString()}</td>
                            <td style={{ padding: '15px', textAlign: 'right' }}>
                              <span style={{ fontSize: '9px', fontWeight: 950, padding: '4px 10px', borderRadius: '8px', background: `${row.color}15`, color: row.color, border: `1px solid ${row.color}30` }}>
                                {row.badge}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ======================================================== */}
            {/* DASHBOARD 3: SERVICE PERFORMANCE */}
            {/* ======================================================== */}
            {activeSection === 'MODALITIES' && (
              <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '30px' }}>
                
                <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '20px' }}>MODALITY GROSS WORKLOAD VS NET CLINIC REALIZATION</h4>
                  
                  {/* Comparative SVG Vertical Bar Chart */}
                  <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
                    <svg viewBox="0 0 700 240" style={{ width: '100%', minWidth: '600px', height: 'auto', display: 'block' }}>
                      {/* Grid Lines */}
                      {[0, 1, 2, 3].map((_, idx) => {
                        const y = 30 + (idx * 140) / 3;
                        return (
                          <line 
                            key={idx} 
                            x1="50" 
                            y1={y} 
                            x2="680" 
                            y2={y} 
                            stroke="#e2e8f0" 
                            strokeWidth="1" 
                            strokeDasharray="4,4" 
                          />
                        );
                      })}

                      {/* Render Columns */}
                      {servicePerformanceData.map((item, idx) => {
                        const barWidth = 16;
                        const groupSpacing = 90;
                        const xStart = 70 + idx * groupSpacing;

                        const maxVal = Math.max(...servicePerformanceData.map(d => d.gross), 50000);
                        const grossHeight = (item.gross * 140) / maxVal;
                        const netHeight = (item.net * 140) / maxVal;

                        return (
                          <g key={idx}>
                            {/* Gross bar (Indigo) */}
                            <rect 
                              x={xStart} 
                              y={170 - grossHeight} 
                              width={barWidth} 
                              height={grossHeight} 
                              fill="#0f52ba" 
                              rx="4" 
                            />
                            {/* Net bar (Emerald) */}
                            <rect 
                              x={xStart + barWidth + 6} 
                              y={170 - netHeight} 
                              width={barWidth} 
                              height={netHeight} 
                              fill="#10b981" 
                              rx="4" 
                            />

                            {/* Modality Label */}
                            <text 
                              x={xStart + barWidth + 3} 
                              y="192" 
                              fill="#64748b" 
                              fontSize="9px" 
                              fontWeight="900" 
                              textAnchor="middle"
                            >
                              {item.modality}
                            </text>
                            {/* Scan Count label */}
                            <text 
                              x={xStart + barWidth + 3} 
                              y="208" 
                              fill="#94a3b8" 
                              fontSize="8px" 
                              fontWeight="800" 
                              textAnchor="middle"
                            >
                              {item.count} SCANS
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                    {/* Simple color legend indicators */}
                    <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '3px', background: '#0f52ba' }} /> GROSS REVENUE
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '3px', background: '#10b981' }} /> NET REALIZED MARGIN
                      </div>
                    </div>
                  </div>
                </div>

                {/* Profitability Matrix Grid */}
                <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '20px' }}>CLINICAL MODALITY PROFITABILITY MATRIX</h4>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left' }}>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>MODALITY</th>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textAlign: 'center' }}>SCAN VOL</th>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>GROSS BILLING (₹)</th>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>DISCOUNT/COMMISSION (₹)</th>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>NET CLINIC YIELD (₹)</th>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>AVG SCAN VALUE (₹)</th>
                          <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textAlign: 'right' }}>COLLECTION EFFICIENCY</th>
                        </tr>
                      </thead>
                      <tbody>
                        {servicePerformanceData.map((row, idx) => {
                          const efficiencyColor = row.efficiency > 90 ? '#059669' : row.efficiency > 80 ? '#d97706' : '#dc2626';
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                              <td style={{ padding: '15px', fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>
                                <span style={{ background: '#f1f5f9', color: '#4f46e5', padding: '4px 8px', borderRadius: '6px', fontSize: '9px', marginRight: '10px', fontWeight: 900 }}>{row.modality.slice(0,3)}</span>
                                {row.modality}
                              </td>
                              <td style={{ padding: '15px', fontSize: '11px', fontWeight: 900, color: '#475569', textAlign: 'center' }}>{row.count}</td>
                              <td style={{ padding: '15px', fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>₹{row.gross.toLocaleString()}</td>
                              <td style={{ padding: '15px', fontSize: '11px', fontWeight: 800, color: '#dc2626' }}>-₹{row.payout.toLocaleString()}</td>
                              <td style={{ padding: '15px', fontSize: '11px', fontWeight: 950, color: '#059669' }}>₹{row.net.toLocaleString()}</td>
                              <td style={{ padding: '15px', fontSize: '11px', fontWeight: 800, color: '#475569' }}>₹{Math.round(row.avgRevenue).toLocaleString()}</td>
                              <td style={{ padding: '15px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 950, color: efficiencyColor }}>{row.efficiency.toFixed(1)}%</span>
                                  <div style={{ width: '90px', height: '4px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                    <div style={{ width: `${row.efficiency}%`, height: '100%', background: efficiencyColor, borderRadius: '10px' }} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ======================================================== */}
            {/* DASHBOARD 3.5: SERVICES SPECIFIC PERFORMANCE */}
            {/* ======================================================== */}
            {activeSection === 'SERVICES' && (
              <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* Summary KPI strip */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '16px' }}>
                  {[{
                    label: 'TOTAL SERVICES', value: allServicesData.length, color: '#4f46e5', bg: '#eef2ff'
                  },{
                    label: 'TOTAL SCANS', value: allServicesData.reduce((s,x) => s + (x.scanCount||0), 0), color: '#0891b2', bg: '#e0f2fe'
                  },{
                    label: 'GROSS BILLING', value: '₹' + Math.round(allServicesData.reduce((s,x) => s + (x.grossRevenue||0), 0)).toLocaleString(), color: '#059669', bg: '#ecfdf5'
                  },{
                    label: 'NET YIELD', value: '₹' + Math.round(allServicesData.reduce((s,x) => s + (x.netRevenue||0), 0)).toLocaleString(), color: '#dc2626', bg: '#fef2f2'
                  }].map((kpi, i) => (
                    <div key={i} style={{ background: kpi.bg, borderRadius: '18px', padding: '18px', border: `1px solid ${kpi.color}22` }}>
                      <div style={{ fontSize: '8px', fontWeight: 950, color: kpi.color, letterSpacing: '1px', marginBottom: '8px' }}>{kpi.label}</div>
                      <div style={{ fontSize: '20px', fontWeight: 950, color: '#1e293b' }}>{kpi.value}</div>
                    </div>
                  ))}
                </div>

                {modalityGroupedServices.length === 0 ? (
                  /* Empty state */
                  <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '60px 30px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>No service data yet</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, lineHeight: 1.6, maxWidth: '380px', margin: '0 auto' }}>
                      Service-level analytics will appear here once invoices with multi-service appointments are recorded.
                      Make sure the API is returning <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>modalityProfitability[].services</code> data.
                    </div>
                  </div>
                ) : (
                  /* Modality-grouped sections */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {modalityGroupedServices.map((modGroup, mIdx) => {
                      const modalityColor = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#0f766e'][mIdx % 7];
                      const modalityGross = (modGroup.services||[]).reduce((s,x) => s + (x.grossRevenue||0), 0);
                      const modalityNet   = (modGroup.services||[]).reduce((s,x) => s + (x.netRevenue||0), 0);
                      const modalityScans = (modGroup.services||[]).reduce((s,x) => s + (x.scanCount||0), 0);
                      return (
                        <div key={mIdx} style={{ background: 'white', borderRadius: '20px', border: `1px solid ${modalityColor}30`, overflow: 'hidden' }}>
                          {/* Modality header */}
                          <div style={{ background: `linear-gradient(135deg, ${modalityColor}12 0%, ${modalityColor}06 100%)`, padding: '16px 22px', borderBottom: `1px solid ${modalityColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ background: modalityColor, color: 'white', padding: '6px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: 950, letterSpacing: '1px' }}>
                                {modGroup.modality}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                                {(modGroup.services||[]).length} service{(modGroup.services||[]).length !== 1 ? 's' : ''} · {modalityScans} scans
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>GROSS</div>
                                <div style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>₹{Math.round(modalityGross).toLocaleString()}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>NET YIELD</div>
                                <div style={{ fontSize: '13px', fontWeight: 950, color: '#059669' }}>₹{Math.round(modalityNet).toLocaleString()}</div>
                              </div>
                            </div>
                          </div>

                          {/* Services table for this modality */}
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
                                  {['SERVICE NAME','SCAN VOL','GROSS (₹)','DISC/COMM (₹)','NET YIELD (₹)','AVG VALUE (₹)','EFFICIENCY'].map((h, hi) => (
                                    <th key={hi} style={{ padding: '10px 14px', fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textAlign: hi === 6 ? 'right' : hi > 0 ? 'center' : 'left' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(modGroup.services||[]).map((svc, si) => {
                                  const effColor = (svc.collectionEfficiency||0) > 90 ? '#059669' : (svc.collectionEfficiency||0) > 75 ? '#d97706' : '#dc2626';
                                  return (
                                    <tr key={si} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.15s' }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                      <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: modalityColor, flexShrink: 0 }} />
                                          {svc.serviceName || 'Unknown Service'}
                                        </div>
                                      </td>
                                      <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 900, color: '#475569', textAlign: 'center' }}>{svc.scanCount || 0}</td>
                                      <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 800, color: '#1e293b', textAlign: 'center' }}>₹{Math.round(svc.grossRevenue||0).toLocaleString()}</td>
                                      <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 800, color: '#dc2626', textAlign: 'center' }}>-₹{Math.round(svc.referralCut||0).toLocaleString()}</td>
                                      <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 950, color: '#059669', textAlign: 'center' }}>₹{Math.round(svc.netRevenue||0).toLocaleString()}</td>
                                      <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>₹{(svc.scanCount||0) > 0 ? Math.round((svc.grossRevenue||0) / svc.scanCount).toLocaleString() : '—'}</td>
                                      <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                          <span style={{ fontSize: '10px', fontWeight: 950, color: effColor }}>{(svc.collectionEfficiency||0).toFixed(1)}%</span>
                                          <div style={{ width: '80px', height: '4px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                            <div style={{ width: `${Math.min(svc.collectionEfficiency||0, 100)}%`, height: '100%', background: effColor, borderRadius: '10px', transition: 'width 0.5s' }} />
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                                {/* Modality subtotal row */}
                                <tr style={{ background: `${modalityColor}08`, borderTop: `2px solid ${modalityColor}20` }}>
                                  <td style={{ padding: '11px 14px', fontSize: '10px', fontWeight: 950, color: modalityColor }}>SUBTOTAL — {modGroup.modality}</td>
                                  <td style={{ padding: '11px 14px', fontSize: '10px', fontWeight: 950, color: '#1e293b', textAlign: 'center' }}>{modalityScans}</td>
                                  <td style={{ padding: '11px 14px', fontSize: '10px', fontWeight: 950, color: '#1e293b', textAlign: 'center' }}>₹{Math.round(modalityGross).toLocaleString()}</td>
                                  <td colSpan={2} style={{ padding: '11px 14px', fontSize: '10px', fontWeight: 950, color: '#059669', textAlign: 'center' }}>NET ₹{Math.round(modalityNet).toLocaleString()}</td>
                                  <td colSpan={2} />
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            )}

            {/* ======================================================== */}
            {/* DASHBOARD 4: PATIENT & REFERRAL TRENDS */}
            {/* ======================================================== */}
            {activeSection === 'TRENDS' && (
              <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '30px' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.3fr', gap: '30px' }}>
                  {/* Stacked Patient Acquisition columns */}
                  <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '20px' }}>NEW VS RETURNING CLINICAL DENSITY</h4>

                    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
                      <svg viewBox="0 0 350 200" style={{ width: '100%', minWidth: '280px', height: 'auto', display: 'block' }}>
                        {/* Grid horizontal Lines */}
                        {[0, 1, 2].map((_, idx) => (
                          <line 
                            key={idx} 
                            x1="30" 
                            y1={25 + idx * 60} 
                            x2="330" 
                            y2={25 + idx * 60} 
                            stroke="#e2e8f0" 
                            strokeWidth="1" 
                            strokeDasharray="4,4" 
                          />
                        ))}

                        {/* Bars */}
                        {patientReferralTrends.patientBreakdown.map((item, idx) => {
                          const barWidth = 16;
                          const spacing = 48;
                          const xStart = 45 + idx * spacing;

                          const totalVal = item.newPatients + item.returnPatients;
                          const maxVal = Math.max(...patientReferralTrends.patientBreakdown.map(d => d.newPatients + d.returnPatients), 50);

                          const newHeight = (item.newPatients * 130) / maxVal;
                          const retHeight = (item.returnPatients * 130) / maxVal;

                          return (
                            <g key={idx}>
                              {/* New patients (Indigo) */}
                              <rect 
                                x={xStart} 
                                y={160 - newHeight} 
                                width={barWidth} 
                                height={newHeight} 
                                fill="#0f52ba" 
                              />
                              {/* Returning patients (Cyan) */}
                              <rect 
                                x={xStart} 
                                y={160 - newHeight - retHeight} 
                                width={barWidth} 
                                height={retHeight} 
                                fill="#06b6d4" 
                              />

                              {/* Labels */}
                              <text 
                                x={xStart + barWidth / 2} 
                                y="180" 
                                fill="#64748b" 
                                fontSize="9px" 
                                fontWeight="900" 
                                textAnchor="middle"
                              >
                                {item.month}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                    {/* Legends */}
                    <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
                        <span style={{ width: '8px', height: '8px', background: '#0f52ba' }} /> NEW CLINICAL ACQUISITION
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
                        <span style={{ width: '8px', height: '8px', background: '#06b6d4' }} /> RETURNING PATIENT SCAN
                      </div>
                    </div>
                  </div>

                  {/* ROI Table */}
                  <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '20px' }}>CLINICAL PHYSICIAN ROI LEDGER</h4>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                            <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>REFERRING DOCTOR</th>
                            <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>GENERATED REVENUE (₹)</th>
                            <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>COMMISSIONS (₹)</th>
                            <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#0f52ba', textAlign: 'right' }}>ROI MULTIPLIER</th>
                          </tr>
                        </thead>
                        <tbody>
                          {patientReferralTrends.roiLedger.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: 'white' }}>
                              <td style={{ padding: '12px', fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{row.name}</td>
                              <td style={{ padding: '12px', fontSize: '11px', fontWeight: 800, color: '#059669' }}>₹{row.revenue.toLocaleString()}</td>
                              <td style={{ padding: '12px', fontSize: '11px', fontWeight: 800, color: '#dc2626' }}>₹{row.commission.toLocaleString()}</td>
                              <td style={{ padding: '12px', textAlign: 'right' }}>
                                <span style={{ fontSize: '10px', fontWeight: 950, background: '#eff6ff', color: '#0f52ba', padding: '4px 10px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                                  {Number.isFinite(row.ratio) ? `${row.ratio.toFixed(1)}x` : '∞'} ROI
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AnalyticsHub;
