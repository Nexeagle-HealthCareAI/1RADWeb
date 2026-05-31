// Referrers master-list cache. Small, slow-changing — typical centre has
// 20-200 referrers. The B1-style delta pattern is overkill but keeps
// consistency with the other domains.

import { liveQuery } from 'dexie';
import { tables } from '../dexie';

export function fromServerDto(dto) {
  if (!dto || !dto.referrerId) return null;
  const updatedAtIso = dto.updatedAt || null;
  return {
    ...dto,
    _updatedAtMs: updatedAtIso ? new Date(updatedAtIso).getTime() : 0,
  };
}

export async function applyServerDeltas(serverDtos) {
  const t = tables.referrers();
  const tombstones = [];
  const live       = [];
  for (const dto of serverDtos || []) {
    if (dto.deletedAt) tombstones.push(dto.referrerId);
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
  const t = tables.referrers();
  const max = await t.orderBy('_updatedAtMs').reverse().limit(1).first();
  if (!max || !max._updatedAtMs) return null;
  return new Date(max._updatedAtMs).toISOString();
}

export function watchReferrers({ search = '' } = {}) {
  const q = (search || '').toLowerCase().trim();
  return liveQuery(async () => {
    const t = tables.referrers();
    const arr = await t.toArray();
    return q
      ? arr.filter(r => (r.name || '').toLowerCase().includes(q))
      : arr;
  });
}

// Referrers are tiny — no eviction unless we get into thousands per centre.
export async function evictOlderThan() { return 0; }
