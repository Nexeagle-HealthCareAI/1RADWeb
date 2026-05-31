// Outbox storage — moved off localStorage onto Dexie in Phase B2 Track 1.
//
// Per-hospital DB means each hospital has its own queue, mirroring the
// real-world semantics ("a mutation queued while logged into hospital A
// belongs to hospital A and can only push there").
//
// Item shape:
//   {
//     id:              UUID
//     type:            'APPOINTMENT_CREATE' | 'PATIENT_CREATE' | ...
//     payload:         original mutation body
//     idempotencyKey:  UUID — sent in Idempotency-Key header so a retry is
//                     a true no-op server-side (Track 2 prereq)
//     attempts:        number of push tries so far
//     poisoned:        0 | 1 — Dexie can't index booleans
//     lastError:       last failure message (debugging aid)
//     createdAtMs:     when queued (drives FIFO order)
//   }

import { liveQuery } from 'dexie';
import { tables } from '../dexie';

export async function enqueue(type, payload) {
  const item = {
    id:             crypto.randomUUID(),
    type,
    payload,
    idempotencyKey: crypto.randomUUID(),
    attempts:       0,
    poisoned:       0,
    lastError:      null,
    createdAtMs:    Date.now(),
  };
  await tables.outbox().add(item);
  return item;
}

// FIFO order — push in the same order the user clicked. Out-of-order
// pushes can violate causality (e.g. STATUS_UPDATE arriving before the
// CREATE the status references).
export async function listPending() {
  return tables.outbox()
    .orderBy('createdAtMs')
    .filter(o => !o.poisoned)
    .toArray();
}

export async function listAll() {
  return tables.outbox().orderBy('createdAtMs').toArray();
}

export async function remove(id) {
  if (!id) return;
  await tables.outbox().delete(id);
}

export async function markFailure(id, errorMessage, attempts) {
  if (!id) return;
  await tables.outbox().update(id, {
    attempts,
    lastError: errorMessage,
  });
}

export async function markPoisoned(id, errorMessage) {
  if (!id) return;
  await tables.outbox().update(id, {
    poisoned:  1,
    lastError: errorMessage,
  });
}

// Settings / dev surface for clearing out records the user has decided
// not to retry. Returns the count purged.
export async function purgePoisoned() {
  const t = tables.outbox();
  return t.where('poisoned').equals(1).delete();
}

// Reactive counter — drives the TopNav "N Pending" chip and any future
// outbox banner. Returns {pending, poisoned}.
export function watchCounts() {
  return liveQuery(async () => {
    const t = tables.outbox();
    const all = await t.toArray();
    let pending = 0;
    let poisoned = 0;
    for (const o of all) {
      if (o.poisoned) poisoned++;
      else pending++;
    }
    return { pending, poisoned };
  });
}

// tempId → realId rewrite. After a successful PATIENT_CREATE the server
// returns the canonical patientId; any APPOINTMENT_CREATE still in the
// queue that references the local tempId must be rewritten before its
// own push attempt or the server will reject the create with a foreign-
// key violation. Returns the count of items rewritten.
// One-time migration from the pre-B2 localStorage outbox. We can't
// attribute each legacy item to the correct hospital after the fact
// (the user might have been at hospital A when they queued and switched
// since), so we re-queue them all into whichever hospital is now active.
// In the absolute worst case the wrong hospital tries to push a mutation
// it doesn't own and the server rejects it (poison). That's strictly
// better than silently dropping the mutation.
const LEGACY_LS_KEY = '1rad_offline_outbox';
export async function migrateLegacyOutbox() {
  try {
    const raw = window.localStorage?.getItem(LEGACY_LS_KEY);
    if (!raw) return 0;
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) {
      window.localStorage.removeItem(LEGACY_LS_KEY);
      return 0;
    }
    const t = tables.outbox();
    let migrated = 0;
    for (const o of items) {
      if (!o?.type) continue;
      await t.add({
        id:             o.id || crypto.randomUUID(),
        type:           o.type,
        payload:        o.payload,
        idempotencyKey: crypto.randomUUID(),
        attempts:       o.attempts || 0,
        poisoned:       o.poisoned ? 1 : 0,
        lastError:      o.lastError || null,
        createdAtMs:    o.timestamp ? new Date(o.timestamp).getTime() : Date.now(),
      });
      migrated++;
    }
    window.localStorage.removeItem(LEGACY_LS_KEY);
    if (migrated) console.info(`[OUTBOX] Migrated ${migrated} legacy localStorage record(s) into Dexie.`);
    return migrated;
  } catch (err) {
    console.warn('[OUTBOX] Legacy migration failed', err);
    return 0;
  }
}

export async function rewriteTempIds(map) {
  if (!map || Object.keys(map).length === 0) return 0;
  const t = tables.outbox();
  const all = await t.toArray();
  let rewritten = 0;
  for (const o of all) {
    if (o.type !== 'APPOINTMENT_CREATE') continue;
    const pid = o.payload?.patientId;
    if (pid && map[pid]) {
      await t.update(o.id, {
        payload: { ...o.payload, patientId: map[pid] },
      });
      rewritten++;
    }
  }
  return rewritten;
}
