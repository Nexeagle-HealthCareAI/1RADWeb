// Invoices cache — read/write.
//
// Same B1-style pattern as appointments and reports:
//   • fromServerDto maps the GET /finance/invoices DTO to a local row
//     (the DTO is already a flat join over Invoice + Patient + Referrer
//     + Appointment + ReferralCommissions, so the cache row is one
//     billing line as the user sees it in the table).
//   • applyServerDeltas bulkPut live rows, bulkDelete tombstones.
//   • highWatermarkIso returns the latest UpdatedAt the local DB has
//     seen, sent back as ?updatedAfter= on the next pull.
//   • watchInvoices is the liveQuery the page subscribes to.

import { liveQuery } from 'dexie';
import { tables } from '../dexie';

export function fromServerDto(dto) {
  if (!dto || !dto.invoiceId) return null;
  const updatedAtIso = dto.updatedAt || null;
  return {
    ...dto,
    _updatedAtMs: updatedAtIso ? new Date(updatedAtIso).getTime() : 0,
  };
}

export async function applyServerDeltas(serverDtos) {
  const t = tables.invoices();
  const tombstones = [];
  const live       = [];
  for (const dto of serverDtos || []) {
    if (dto.deletedAt) tombstones.push(dto.invoiceId);
    else {
      const row = fromServerDto(dto);
      if (row) live.push(row);
    }
  }
  if (tombstones.length) await t.bulkDelete(tombstones);
  if (live.length)       await t.bulkPut(live);
  return { applied: live.length, deleted: tombstones.length };
}

export async function highWatermarkIso() {
  const t = tables.invoices();
  const max = await t.orderBy('_updatedAtMs').reverse().limit(1).first();
  if (!max || !max._updatedAtMs) return null;
  return new Date(max._updatedAtMs).toISOString();
}

// Reactive read. BillingPage subscribes to this and re-renders whenever
// the sync engine writes a delta. Filters mirror the existing legacy
// server filters (status, date range, search) so the offline experience
// matches the online one.
export function watchInvoices({
  status = 'ALL',
  startDateIso,
  endDateIso,
  search = '',
} = {}) {
  const q = (search || '').toLowerCase().trim();
  return liveQuery(async () => {
    const t = tables.invoices();
    let arr = await t.orderBy('createdAt').reverse().toArray();

    if (status && status !== 'ALL') {
      arr = arr.filter(r => (r.status || '').toUpperCase() === status.toUpperCase());
    }
    if (startDateIso) {
      arr = arr.filter(r => (r.createdAt || '') >= startDateIso);
    }
    if (endDateIso) {
      // EndDate is inclusive; bump to end-of-day for the comparison.
      const eod = endDateIso.length === 10 ? endDateIso + 'T23:59:59.999Z' : endDateIso;
      arr = arr.filter(r => (r.createdAt || '') <= eod);
    }
    if (q) {
      arr = arr.filter(r =>
        (r.patientName || '').toLowerCase().includes(q) ||
        (r.displayId   || '').toLowerCase().includes(q) ||
        (r.referrerName|| '').toLowerCase().includes(q)
      );
    }
    return arr;
  });
}

// Eviction — drop invoices whose createdAt is older than the cut-off.
// Called by the quota monitor when storage fills up.
export async function evictOlderThan(daysAgo) {
  if (!Number.isFinite(daysAgo) || daysAgo <= 0) return 0;
  const cutoffIso = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
  const t = tables.invoices();
  return t.filter(r => (r.createdAt || '') < cutoffIso).delete();
}

export async function getInvoiceById(invoiceId) {
  if (!invoiceId) return null;
  return tables.invoices().get(invoiceId);
}
