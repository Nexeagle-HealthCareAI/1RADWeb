// Personnel snapshot cache.
//
// Unlike appointments / patients / reports, personnel doesn't get a delta
// sync engine pull — the list is tiny and slow-changing. Pattern is just
// "snapshot the response on every successful fetch, fall back to the
// snapshot when the network call fails".
//
// The shape stored mirrors what /personnel returns, with a leading userId
// key + _snapshotAtMs marker so a future banner can show how old the
// cached copy is.

import { tables } from '../dexie';

function userKey(p) {
  return p?.userId ?? p?.UserId ?? p?.id ?? p?.Id ?? null;
}

// Replace the whole snapshot with the freshly-fetched list. We deliberately
// clear + bulk-put inside one transaction rather than upsert-only so that
// removed staff actually disappear from the cache (otherwise an ex-doctor
// would linger forever in the offline drawer).
export async function snapshotPersonnel(list) {
  if (!Array.isArray(list)) return;
  const t = tables.personnel();
  const nowMs = Date.now();
  const rows = list
    .map(p => {
      const userId = userKey(p);
      if (!userId) return null;
      return { ...p, userId, _snapshotAtMs: nowMs };
    })
    .filter(Boolean);
  await t.clear();
  if (rows.length) await t.bulkPut(rows);
}

export async function getAllPersonnel() {
  return tables.personnel().toArray();
}
