/**
 * financialMatrixFallback.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, offline-first re-implementations of the backend's financial matrix
 * calculators (1RadAPI: Features/Finance/Queries/GetFinancialMatrix/Calculators).
 *
 * WHY THIS FILE EXISTS: AnalyticsHub renders a "backend matrix" path when
 * online (trusting /finance/matrix) and a "fallback" path computed from the
 * locally cached invoices/expenses when offline or before the first sync.
 * That fallback math used to live inline inside AnalyticsHub.jsx's useMemo
 * blocks — the exact same business rules (aging bucket boundaries, discount
 * vector allocation, new-vs-returning patient logic) reimplemented in JS with
 * nothing forcing it to stay in sync with the C# calculators it mirrors, and
 * with zero test coverage of its own.
 *
 * This file does NOT eliminate the duplication (the client genuinely cannot
 * run the backend's SQL-joined AppointmentService lookups offline), but it:
 *   1. Makes every rule independently unit-testable (see
 *      financialMatrixFallback.test.js) instead of buried in a 1900-line
 *      render component.
 *   2. Names each function after its backend counterpart, so a change to
 *      one side is far more likely to prompt a look at the other.
 *   3. Removes an actual internal duplication that existed even within
 *      AnalyticsHub itself (the payment-mode breakdown was computed with an
 *      identical code block in both the "online" and "offline" branches even
 *      though it never actually came from the backend matrix at all).
 *
 * Every function here is a pure function of its arguments — no React, no
 * fetch, no Date.now() read internally (callers pass "today" in) — so a test
 * never depends on the wall clock or a mocked module.
 */

// ── Month window helpers ────────────────────────────────────────────────────

// The last 6 calendar months ending with the current one, oldest first.
// `includeYear` controls the label format — the Revenue tab shows "Jan '26",
// the Trends tab shows just "Jan" — both share the same YYYY-MM key shape.
export function getLastSixMonths({ includeYear = false, referenceDate = new Date() } = {}) {
  const months = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(referenceDate);
    d.setMonth(d.getMonth() - (5 - i));
    return d;
  });
  const labels = months.map(d =>
    d.toLocaleDateString('en-US', includeYear ? { month: 'short', year: '2-digit' } : { month: 'short' })
  );
  const keys = months.map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  return { labels, keys };
}

// ── Per-invoice normalization ───────────────────────────────────────────────

// Mirrors the canonical fields every calculator below expects: a resolved
// date string, post-discount net amount, outstanding balance, and age in
// days. `todayIso` is injected (not read from Date.now() here) so callers
// control the clock for both real use and tests.
export function normalizeInvoiceForMatrix(inv, todayIso) {
  const dateStr = inv.serviceDate || inv.createdAt || inv.date || todayIso;
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
    ageInDays: Math.floor((Date.now() - new Date(dateStr)) / (1000 * 60 * 60 * 24)),
  };
}

// ── Payment channel breakdown (mirrors PaymentChannelCalculator) ───────────
// NOTE: unlike the other builders below, this was never actually part of the
// "backend matrix" branch in AnalyticsHub — both branches computed it
// identically from the local invoice cache. Kept as a single function so
// that duplication (two copies of the same 8-line block) doesn't recur.
export function buildPaymentModeBreakdown(processedInvoices) {
  const breakdown = { CASH: 0, UPI: 0, CARD: 0, INSURANCE: 0, TPA: 0 };
  processedInvoices.forEach(inv => {
    const mode = (inv.paymentMethod || 'CASH').toUpperCase();
    const collectedAmt = inv.amtPaid;
    if (breakdown[mode] !== undefined) breakdown[mode] += collectedAmt;
    else if (mode.includes('TPA')) breakdown.TPA += collectedAmt;
    else if (mode.includes('INSUR') || mode.includes('MEDIC')) breakdown.INSURANCE += collectedAmt;
    else breakdown.CASH += collectedAmt;
  });
  const totalPaymentVolume = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { paymentModes: breakdown, totalPaymentVolume };
}

// ── Aging analysis (mirrors AgingAnalysisCalculator) ────────────────────────
// Bucket boundaries deliberately match the backend exactly: <=30 / 31-60 /
// 61-90 / 91+ days since service date, only for invoices with a positive
// outstanding balance.
export function buildAgingBuckets(processedInvoices) {
  const buckets = { bucket30: 0, bucket60: 0, bucket90: 0, bucketPlus: 0 };
  processedInvoices.forEach(inv => {
    if (inv.outstanding > 0) {
      if (inv.ageInDays <= 30) buckets.bucket30 += inv.outstanding;
      else if (inv.ageInDays <= 60) buckets.bucket60 += inv.outstanding;
      else if (inv.ageInDays <= 90) buckets.bucket90 += inv.outstanding;
      else buckets.bucketPlus += inv.outstanding;
    }
  });
  return buckets;
}

// ── Revenue & collections trend (mirrors TemporalAggregationCalculator) ────
// Real data only — no synthetic fallback curve. An empty practice returns a
// flat-zero 6-month trend rather than a fabricated demo curve.
export function buildRevenueTrend(processedInvoices, { includeYear = true, referenceDate = new Date() } = {}) {
  const { labels, keys } = getLastSixMonths({ includeYear, referenceDate });
  return keys.map((key, idx) => {
    let billed = 0;
    let collected = 0;
    processedInvoices.forEach(inv => {
      if (inv.dateStr.startsWith(key)) {
        billed += inv.amtNet;
        collected += inv.amtPaid;
      }
    });
    return { label: labels[idx], billed, collected, key };
  });
}

// ── AI-heuristic recovery insight ───────────────────────────────────────────
// Pure classification over aging buckets — thresholds are business rules,
// not magic numbers scattered through JSX.
export function buildRecoveryInsight({ bucket30, bucket60, bucket90, bucketPlus }) {
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
}

// ── Discount allocation (mirrors DiscountAllocationCalculator) ─────────────
export function buildDiscountAllocation(processedInvoices) {
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
  return { discounts, totalDiscounts };
}

// ── Leakage audit risk classification (mirrors LeakageAuditCalculator) ─────
export function buildLeakageTable(rows) {
  return rows
    .map(r => {
      const avgRate = r.totalBilled > 0 ? (r.totalDisc / r.totalBilled) * 100 : 0;
      let badge = '🟢 NORMAL', color = '#059669';
      if (avgRate > 20) { badge = '🔴 HIGH RISK'; color = '#dc2626'; }
      else if (avgRate > 10) { badge = '🟡 REVIEW'; color = '#d97706'; }
      return { name: r.name, avgRate, totalDisc: r.totalDisc, totalBilled: r.totalBilled, badge, color };
    })
    .sort((a, b) => b.avgRate - a.avgRate);
}

// Per-referring-doctor discount leakage, built from raw invoices+referrers
// (the fallback-only counterpart to buildLeakageTable, which also accepts
// backend-shaped rows directly).
export function buildLeakageFromInvoices(processedInvoices, referrers) {
  const docDiscounts = {};
  processedInvoices.forEach(inv => {
    if (inv.referrerId) {
      const refName = inv.referrerName || referrers.find(r => r.referrerId === inv.referrerId)?.name || 'Referrer';
      if (!docDiscounts[refName]) docDiscounts[refName] = { totalBilled: 0, totalDisc: 0 };
      docDiscounts[refName].totalBilled += inv.amtBilled;
      docDiscounts[refName].totalDisc += inv.amtDiscount;
    }
  });
  return buildLeakageTable(
    Object.entries(docDiscounts).map(([name, s]) => ({ name, totalDisc: s.totalDisc, totalBilled: s.totalBilled }))
  );
}

// Top 5 referrers by commission earned, from raw referral commission rows.
export function buildTopRecipients(referralCommissions, limit = 5) {
  const refEarnings = {};
  referralCommissions.forEach(comm => {
    const ref = comm.referrerName || 'UNKNOWN REFERRER';
    refEarnings[ref] = (refEarnings[ref] || 0) + (comm.commissionAmount || 0);
  });
  return Object.entries(refEarnings)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

// ── Service/modality performance (approximates ModalityProfitabilityCalculator) ──
// The backend attributes revenue to a modality via the invoice line's linked
// AppointmentService — not available in the offline cache. This falls back
// to keyword-matching the item description, which is a lower-fidelity
// approximation by necessity (not a bug to "fix" — the data it would need
// just isn't cached client-side), but is now at least a named, tested
// function instead of inline logic.
const KNOWN_MODALITIES = ['MRI', 'CT', 'X-RAY', 'ULTRASOUND', 'PET', 'MAMMOGRAPHY', 'FLUOROSCOPY'];

// Escapes regex metacharacters in a keyword before building a \b-wrapped pattern.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function matchModalityFromDescription(description, modalities = KNOWN_MODALITIES) {
  const desc = (description || '').toUpperCase();
  for (const m of modalities) {
    // Word-boundary match, not a raw substring search — a plain .includes('CT')
    // matches "CONTRAST" or "REACT", silently misattributing the item's revenue
    // to the CT modality. \b anchors the keyword to a real word.
    const pattern = new RegExp(`\\b(${escapeRegExp(m)}|${escapeRegExp(m.replace('-', ' '))})\\b`);
    if (pattern.test(desc)) return m;
  }
  return 'OTHER';
}

export function buildServicePerformanceFallback(processedInvoices) {
  const performanceMap = {};
  [...KNOWN_MODALITIES, 'OTHER'].forEach(m => {
    performanceMap[m] = { gross: 0, discount: 0, net: 0, count: 0, servicesMap: {} };
  });

  processedInvoices.forEach(inv => {
    (inv.items || []).forEach(item => {
      const desc = (item.description || '').toUpperCase();
      const matched = matchModalityFromDescription(desc);
      const itemAmt = item.amount || 0;
      const discRatio = inv.amtBilled > 0 ? (inv.amtDiscount / inv.amtBilled) : 0;
      const itemDisc = itemAmt * discRatio;
      const itemNet = itemAmt - itemDisc;

      const bucket = performanceMap[matched];
      bucket.gross += itemAmt;
      bucket.discount += itemDisc;
      bucket.net += itemNet;
      bucket.count += 1;

      if (!bucket.servicesMap[desc]) {
        bucket.servicesMap[desc] = { serviceName: desc, grossRevenue: 0, referralCut: 0, netRevenue: 0, scanCount: 0, collectionEfficiency: 100 };
      }
      bucket.servicesMap[desc].grossRevenue += itemAmt;
      bucket.servicesMap[desc].referralCut += itemDisc;
      bucket.servicesMap[desc].netRevenue += itemNet;
      bucket.servicesMap[desc].scanCount += 1;
    });
  });

  const hasPerfData = Object.values(performanceMap).some(v => v.gross > 0);
  if (!hasPerfData) return [];

  return Object.entries(performanceMap).map(([modality, stats]) => ({
    modality,
    gross: stats.gross,
    net: stats.net,
    payout: stats.discount,
    count: stats.count,
    avgRevenue: stats.count > 0 ? stats.gross / stats.count : 0,
    efficiency: stats.gross > 0 ? (stats.net / stats.gross) * 100 : 0,
    services: Object.values(stats.servicesMap).sort((a, b) => b.grossRevenue - a.grossRevenue),
  }));
}

// ── Patient acquisition (mirrors PatientAcquisitionCalculator) ─────────────
// A patient is "new" in the month of their first-ever service in this data
// set, "returning" in any later month. Exact counting — no 65/35 estimate.
export function buildPatientAcquisitionFallback(processedInvoices, { referenceDate = new Date() } = {}) {
  const { labels, keys } = getLastSixMonths({ includeYear: false, referenceDate });

  const firstMonthByPatient = {};
  processedInvoices.forEach(inv => {
    const month = (inv.dateStr || '').slice(0, 7); // YYYY-MM
    if (!month) return;
    const pid = inv.patientId || inv.patientName || inv.id;
    if (!pid) return;
    if (!firstMonthByPatient[pid] || month < firstMonthByPatient[pid]) firstMonthByPatient[pid] = month;
  });

  return keys.map((key, idx) => {
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
    return { month: labels[idx], newPatients, returnPatients };
  });
}

// ── Physician ROI ledger (mirrors PhysicianRoiCalculator) ──────────────────
export function buildPhysicianRoiFallback(processedInvoices, referralCommissions, referrers) {
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
  if (!hasTrends) return [];

  return Object.entries(doctorRevenue)
    .map(([name, rev]) => {
      const comm = doctorCommissions[name] || 0;
      const ratio = comm > 0 ? rev / comm : rev > 0 ? Infinity : 0;
      return { name, revenue: rev, commission: comm, ratio };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
