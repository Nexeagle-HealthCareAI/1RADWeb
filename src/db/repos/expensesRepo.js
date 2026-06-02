// Expenses cache — same pattern as invoicesRepo. Server projects a flat
// ExpenseDto; we mirror it locally as a single row per expense entry,
// keyed by `id` (matches the DTO's GUID).

import { liveQuery } from 'dexie';
import { tables } from '../dexie';

export function fromServerDto(dto) {
  if (!dto || !dto.id) return null;
  const updatedAtIso = dto.updatedAt || null;
  return {
    ...dto,
    _updatedAtMs: updatedAtIso ? new Date(updatedAtIso).getTime() : 0,
  };
}

export async function applyServerDeltas(serverDtos) {
  const t = tables.expenses();
  const tombstones = [];
  const live       = [];
  for (const dto of serverDtos || []) {
    if (dto.deletedAt) tombstones.push(dto.id);
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
  const t = tables.expenses();
  const max = await t.orderBy('_updatedAtMs').reverse().limit(1).first();
  if (!max || !max._updatedAtMs) return null;
  // +1ms past the last-seen row — the server's sub-ms UpdatedAt is always > our
  // ms-truncated value, which otherwise re-pulls the boundary rows every cycle.
  return new Date(max._updatedAtMs + 1).toISOString();
}

export function watchExpenses({
  category = 'ALL',
  startDateIso,
  endDateIso,
  search = '',
} = {}) {
  const q = (search || '').toLowerCase().trim();
  return liveQuery(async () => {
    const t = tables.expenses();
    let arr = await t.orderBy('transactionDate').reverse().toArray();

    if (category && category !== 'ALL') {
      arr = arr.filter(r => (r.category || '') === category);
    }
    if (startDateIso) {
      arr = arr.filter(r => (r.transactionDate || '') >= startDateIso);
    }
    if (endDateIso) {
      const eod = endDateIso.length === 10 ? endDateIso + 'T23:59:59.999Z' : endDateIso;
      arr = arr.filter(r => (r.transactionDate || '') <= eod);
    }
    if (q) {
      arr = arr.filter(r =>
        (r.description     || '').toLowerCase().includes(q) ||
        (r.vendorName      || '').toLowerCase().includes(q) ||
        (r.referenceNumber || '').toLowerCase().includes(q)
      );
    }
    return arr;
  });
}

export async function evictOlderThan(daysAgo) {
  if (!Number.isFinite(daysAgo) || daysAgo <= 0) return 0;
  const cutoffIso = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
  const t = tables.expenses();
  return t.filter(r => (r.transactionDate || '') < cutoffIso).delete();
}
