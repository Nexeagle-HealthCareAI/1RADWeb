// Client-side financial aggregator.
//
// The server has canonical /finance/stats + /finance/matrix endpoints that
// compute these numbers in SQL. They're authoritative when online and the
// outbox is empty. But when the user is offline OR has queued mutations
// the server numbers are stale by exactly those mutations, which is
// confusing — they just created an invoice and the dashboard doesn't move.
//
// This module computes the same shape of stats + matrix from the local
// Dexie cache (invoices + expenses + commissions) so the BillingPage can
// fall back to it when the server numbers can't reflect reality. Pure
// functions — easy to unit-test, no React, no I/O.
//
// Public API:
//   computeStats(invoices)
//   computeMatrix(invoices, { from, to })
//
// Outputs match the shapes the existing BillingPage state uses:
//   stats   = { totalRevenue, pendingCount, realizationRate, averageTicket,
//               pendingRevenue }
//   matrix  = { daily: [{ date, revenue, count }],
//               weekly:  [{ week, revenue, count }],
//               monthly: [{ month, revenue, count }],
//               yearly:  [{ year, revenue, count }],
//               modalityBreakdown: [{ modality, revenue, count }] }

function ymd(input) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function isoWeekKey(input) {
  // YYYY-Www where Www is the ISO-8601 week number. Matches the server's
  // weekly bucketing convention. Cheap implementation; good enough for
  // dashboard buckets.
  if (!input) return '';
  const d = input instanceof Date ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Canonical date basis (agreed 2026-06-14): bucket by ServiceDate (when the scan
// happened), matching the server. Fall back to createdAt only if absent.
function invoiceDate(inv) {
  return inv?.serviceDate || inv?.createdAt || null;
}

function num(v) { return Number(v) || 0; }

// Headline stats. Mirrors the shape /finance/stats returns so the
// BillingPage can drop these into setStats without further mapping.
export function computeStats(invoices) {
  let totalRevenue   = 0;
  let pendingRevenue = 0;
  let pendingCount   = 0;
  let paidRevenue    = 0;
  let paidCount      = 0;

  for (const inv of invoices || []) {
    const total   = num(inv.totalAmount);
    const paid    = num(inv.paidAmount);
    const balance = inv.balanceAmount != null ? num(inv.balanceAmount) : (total - paid);
    const status  = (inv.status || '').toUpperCase();
    if (status === 'CANCELLED') continue;

    totalRevenue += total;
    paidRevenue  += paid;
    if (status === 'PAID') paidCount++;
    if (balance > 0) {
      pendingRevenue += balance;
      pendingCount++;
    }
  }

  const totalCount       = (invoices?.length || 0);
  const realizationRate  = totalRevenue > 0 ? (paidRevenue / totalRevenue) * 100 : 0;
  const averageTicket    = totalCount > 0 ? (totalRevenue / totalCount) : 0;

  return {
    totalRevenue:    Math.round(totalRevenue * 100) / 100,
    pendingRevenue:  Math.round(pendingRevenue * 100) / 100,
    pendingCount,
    averageTicket:   Math.round(averageTicket * 100) / 100,
    realizationRate: Math.round(realizationRate * 100) / 100,
  };
}

// Time-bucketed matrix. `from` and `to` are optional ISO date strings
// (YYYY-MM-DD); when omitted we use the whole invoice set.
export function computeMatrix(invoices, { from, to } = {}) {
  const inRange = (inv) => {
    const d = ymd(invoiceDate(inv));
    if (!d) return false;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  };

  const dailyMap    = new Map();
  const weeklyMap   = new Map();
  const monthlyMap  = new Map();
  const yearlyMap   = new Map();
  const modalityMap = new Map();

  for (const inv of invoices || []) {
    if (!inRange(inv)) continue;
    const status = (inv.status || '').toUpperCase();
    if (status === 'CANCELLED') continue;
    const rev = num(inv.totalAmount);
    const d   = ymd(invoiceDate(inv));
    if (!d) continue;

    const w  = isoWeekKey(invoiceDate(inv));
    const m  = d.slice(0, 7);   // YYYY-MM
    const y  = d.slice(0, 4);   // YYYY
    const mod = inv.modality || 'Unspecified';

    const bump = (map, key) => {
      const existing = map.get(key) || { revenue: 0, count: 0 };
      existing.revenue += rev;
      existing.count   += 1;
      map.set(key, existing);
    };
    bump(dailyMap,    d);
    bump(weeklyMap,   w);
    bump(monthlyMap,  m);
    bump(yearlyMap,   y);
    bump(modalityMap, mod);
  }

  const toSorted = (map, keyName) =>
    [...map.entries()]
      .map(([k, v]) => ({ [keyName]: k, revenue: Math.round(v.revenue * 100) / 100, count: v.count }))
      .sort((a, b) => String(a[keyName]).localeCompare(String(b[keyName])));

  return {
    daily:             toSorted(dailyMap,   'date'),
    weekly:            toSorted(weeklyMap,  'week'),
    monthly:           toSorted(monthlyMap, 'month'),
    yearly:            toSorted(yearlyMap,  'year'),
    modalityBreakdown: [...modalityMap.entries()]
      .map(([modality, v]) => ({ modality, revenue: Math.round(v.revenue * 100) / 100, count: v.count }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}
