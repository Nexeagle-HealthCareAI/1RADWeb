// Referral commissions cache. Per-appointment commission rows; the
// referrals page lists them with status + date-range filters.

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
  const t = tables.referral_commissions();
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
  const t = tables.referral_commissions();
  const max = await t.orderBy('_updatedAtMs').reverse().limit(1).first();
  if (!max || !max._updatedAtMs) return null;
  // +1ms past the last-seen row — the server's sub-ms UpdatedAt is always > our
  // ms-truncated value, which otherwise re-pulls the boundary rows every cycle.
  return new Date(max._updatedAtMs + 1).toISOString();
}

export function watchReferralCommissions({
  status = 'ALL',
  startDateIso,
  endDateIso,
  referrerId,
} = {}) {
  return liveQuery(async () => {
    const t = tables.referral_commissions();
    let arr = await t.orderBy('transactionDate').reverse().toArray();

    if (status && status !== 'ALL') {
      arr = arr.filter(r => (r.status || '').toUpperCase() === status.toUpperCase());
    }
    if (referrerId) {
      arr = arr.filter(r => r.referrerId === referrerId);
    }
    if (startDateIso) {
      arr = arr.filter(r => (r.transactionDate || '') >= startDateIso);
    }
    if (endDateIso) {
      const eod = endDateIso.length === 10 ? endDateIso + 'T23:59:59.999Z' : endDateIso;
      arr = arr.filter(r => (r.transactionDate || '') <= eod);
    }
    return arr;
  });
}

export async function evictOlderThan(daysAgo) {
  if (!Number.isFinite(daysAgo) || daysAgo <= 0) return 0;
  const cutoffIso = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
  const t = tables.referral_commissions();
  return t.filter(r => (r.transactionDate || '') < cutoffIso).delete();
}

// ── Page-aware reactive read ────────────────────────────────────────────────
// Same cursor pattern. Cursor = { transactionDate, id }.
export const PAGE_SIZE_COMMISSIONS = 25;

export function watchCommissionsPage(
  filters = {},
  { pageSize = PAGE_SIZE_COMMISSIONS, cursor = null } = {}
) {
  const { status = 'ALL', startDateIso, endDateIso, referrerId } = filters;

  return liveQuery(async () => {
    const t = tables.referral_commissions();
    let arr = await t.orderBy('transactionDate').reverse().toArray();

    if (status && status !== 'ALL') {
      arr = arr.filter(r => (r.status || '').toUpperCase() === status.toUpperCase());
    }
    if (referrerId) {
      arr = arr.filter(r => r.referrerId === referrerId);
    }
    if (startDateIso) {
      arr = arr.filter(r => (r.transactionDate || '') >= startDateIso);
    }
    if (endDateIso) {
      const eod = endDateIso.length === 10 ? endDateIso + 'T23:59:59.999Z' : endDateIso;
      arr = arr.filter(r => (r.transactionDate || '') <= eod);
    }

    const totalCount = arr.length;

    if (cursor) {
      const idx = arr.findIndex(
        r => r.transactionDate === cursor.transactionDate && r.id === cursor.id
      );
      if (idx >= 0) arr = arr.slice(idx + 1);
    }

    const page = arr.slice(0, pageSize);
    const nextCursor =
      arr.length > pageSize
        ? { transactionDate: page[page.length - 1].transactionDate, id: page[page.length - 1].id }
        : null;

    return { rows: page, nextCursor, totalCount };
  });
}
