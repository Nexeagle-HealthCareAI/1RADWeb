// ServiceCharges snapshot cache. Same pattern as personnelRepo: small list
// (typically <100 entries per centre, changes a few times a month). Each
// successful fetch clears the table and writes the full snapshot; reads
// fall back to the snapshot when offline.

import { liveQuery } from 'dexie';
import { tables } from '../dexie';

function idOf(p) {
  return p?.id ?? p?.Id ?? p?.serviceId ?? p?.ServiceId ?? null;
}

export async function snapshotServiceCharges(list) {
  if (!Array.isArray(list)) return;
  const t = tables.service_charges();
  const nowMs = Date.now();
  const rows = list
    .map(p => {
      const id = idOf(p);
      if (!id) return null;
      return { ...p, id, _snapshotAtMs: nowMs };
    })
    .filter(Boolean);
  await t.clear();
  if (rows.length) await t.bulkPut(rows);
}

export async function getAllServiceCharges() {
  return tables.service_charges().toArray();
}

// Reactive view of the cached price registry. Re-emits whenever the snapshot
// changes — including the sync engine's background refresh after a price was
// edited elsewhere — so booking/billing price lists update with no manual
// refresh.
export function watchServiceCharges() {
  return liveQuery(async () => tables.service_charges().toArray());
}
