// Offline-first local database — Phase B2 Track 5 update.
//
// What changed from B1: there is no longer a single shared database. Each
// hospital has its own Dexie instance, keyed by hospitalId in the DB name.
// The motivation:
//   • Users routinely switch between hospitals during the day. With one
//     shared DB, the cache was a leak surface — the previous hospital's
//     worklist would render until the next sync overwrote it.
//   • Tenancy filters at query time aren't enough: a stray liveQuery
//     subscription set up in one centre's session could keep firing when
//     the user has switched centres. Per-hospital DB isolation makes
//     cross-tenant leakage structurally impossible.
//
// Lifecycle:
//   1. Login completes → AuthContext calls setActiveHospital(hospitalId).
//   2. tables.* accessors now resolve to that hospital's DB.
//   3. Centre switch → AuthContext calls setActiveHospital(newHospitalId)
//      again. Old DB instance stays open (re-entering the previous centre
//      is instant). All liveQuery subscriptions keyed on activeCenterId
//      automatically tear down and re-subscribe against the new DB.
//   4. Logout → clearLocalDatabase() deletes every per-hospital DB it
//      can enumerate, PLUS the legacy v1 name as a one-time migration.
//
// What does NOT change: the schema. Versions 1..4 are applied to every
// per-hospital DB identically. A future schema bump is a one-line edit
// inside applySchema().

import Dexie from 'dexie';

const DB_NAME_PREFIX = '1rad_offline_v1_';
// Pre-B2 single-DB name. Kept here so the first post-upgrade login can
// purge it (the cache repopulates from the server within seconds — no
// reason to leave stale per-tenant data on the device).
const LEGACY_DB_NAME = '1rad_offline_v1';

// Schema registration is shared across every per-hospital DB. Whenever
// you add a new table or bump a version, edit ONLY this function — every
// existing per-hospital DB on the user's device will migrate forward on
// next open without any per-DB special-casing.
function applySchema(inst) {
  inst.version(1).stores({
    appointments: 'appointmentId, dateTime, status, _updatedAtMs, _localDirty',
    meta: '&key',
  });

  inst.version(2).stores({
    patients: 'patientId, _fullNameLower, _mobileLower, _patientIdentifierLower, _updatedAtMs, _localDirty',
  });

  inst.version(3).stores({
    reports: 'appointmentId, isFinalized, _updatedAtMs, _localDirty',
  });

  inst.version(4).stores({
    personnel: 'userId, _snapshotAtMs',
  });

  // v5 — Phase B2 Track 1: outbox moves from localStorage into Dexie so
  // it shares the offline cache lifecycle (clear-on-logout for PHI
  // hygiene). Per-hospital naturally falls out of the per-hospital DB
  // model: a mutation queued at hospital A cannot accidentally push at
  // hospital B.
  //   • id           — UUID; primary key, never re-used.
  //   • createdAtMs  — time queued, drives FIFO replay order.
  //   • poisoned     — 1/0 flag (Dexie can't index booleans; use 0/1).
  //   • type         — coarse filter for outbox debugging.
  inst.version(5).stores({
    outbox: 'id, createdAtMs, poisoned, type',
  });

  // v6 — Phase B3 Slice 1: cache Invoices so BillingPage works offline.
  // Same shape conventions as appointments/patients/reports.
  //   • invoiceId   — primary key (matches DTO's InvoiceId GUID).
  //   • status      — PENDING / PARTIAL / PAID / CANCELLED filter.
  //   • createdAt   — drives the default DESC sort.
  //   • _updatedAtMs — delta-pull high-water mark.
  inst.version(6).stores({
    invoices: 'invoiceId, status, createdAt, _updatedAtMs',
  });

  // v7 — Phase B3 Slice 3: Expenses. Keyed on id (the ExpenseDto's Id).
  // Status is unused for filtering today (almost always "Paid") but
  // indexed for future use. transactionDate drives the default DESC sort
  // matching the legacy server query.
  inst.version(7).stores({
    expenses: 'id, category, transactionDate, _updatedAtMs',
  });

  // v8 — Phase B3 Slice 4: Referrers (master list). Small, slow-changing,
  // could have been a snapshot like Personnel but we already have the
  // delta-pull plumbing so the consistency is worth keeping.
  // v8 — Phase B3 Slice 5: ReferralCommissions. Per-appointment commission
  // rows, larger and faster-changing than Referrers. Status indexed for
  // the UNPAID/PAID filter on the referrals page.
  inst.version(8).stores({
    referrers:           'referrerId, _updatedAtMs',
    referral_commissions:'id, referrerId, status, transactionDate, _updatedAtMs',
  });

  // v9 — Phase B3 Slice 7: ServiceCharges (service-price registry). Small,
  // slow-changing list — same snapshot pattern as Personnel: clear +
  // bulkPut on every successful fetch; read from cache when offline.
  inst.version(9).stores({
    service_charges: 'id, _snapshotAtMs',
  });
}

// In-process registry. Multiple hospitals can be opened in the same tab
// over a session (centre switching) — keep the instances around so
// switching back is instant. Closed only on logout.
const instances = new Map(); // hospitalId → Dexie

let activeHospitalId = null;

// Listeners notified when the active hospital changes. The SyncEngine
// subscribes to this so it can re-pull when the user switches centre.
// Plain emitter — no need for a full event bus.
const switchListeners = new Set();

function lc(s) { return (s ?? '').toString().toLowerCase(); }

function openDbFor(hospitalId) {
  const key = lc(hospitalId);
  if (!key) return null;
  let inst = instances.get(key);
  if (inst) return inst;
  inst = new Dexie(`${DB_NAME_PREFIX}${key}`);
  applySchema(inst);
  instances.set(key, inst);
  return inst;
}

// Setter called from AuthContext on login + centre switch. No-ops if the
// id is unchanged so we don't fire a flood of "switch" events when the
// effect re-runs against the same id.
export function setActiveHospital(hospitalId) {
  const next = lc(hospitalId) || null;
  if (next === activeHospitalId) return;
  activeHospitalId = next;
  // Lazy: ensure the instance exists so the first table() call is
  // instant (no schema-open jank during a render).
  if (next) openDbFor(next);
  for (const fn of switchListeners) {
    try { fn(next); } catch (err) { console.warn('[DB] switch listener failed', err); }
  }
}

export function getActiveHospitalId() {
  return activeHospitalId;
}

export function onHospitalSwitch(fn) {
  switchListeners.add(fn);
  return () => switchListeners.delete(fn);
}

// Returns the active hospital's DB or null if no hospital is selected
// yet. Callers MUST handle null — components are mounted before AuthContext
// resolves the active centre on first paint.
export function getActiveDb() {
  if (!activeHospitalId) return null;
  return openDbFor(activeHospitalId);
}

// Stub table object used when no hospital is active yet. Reads return
// empty results, writes silently no-op. This lets liveQuery subscribers
// keep working during the pre-hospital window of the auth boot — the
// real data comes in on the next subscription cycle after
// setActiveHospital fires.
const EMPTY_COLLECTION = {
  toArray: async () => [],
  first:   async () => undefined,
  limit:   () => EMPTY_COLLECTION,
  reverse: () => EMPTY_COLLECTION,
  filter:  () => EMPTY_COLLECTION,
  count:   async () => 0,
  delete:  async () => 0,
};
const EMPTY_TABLE = {
  toArray:   async () => [],
  get:       async () => undefined,
  put:       async () => undefined,
  add:       async () => undefined,
  delete:    async () => undefined,
  update:    async () => 0,
  bulkPut:   async () => undefined,
  bulkDelete:async () => undefined,
  clear:     async () => undefined,
  count:     async () => 0,
  where:     () => ({
    startsWith: () => EMPTY_COLLECTION,
    equals:     () => EMPTY_COLLECTION,
  }),
  orderBy:   () => EMPTY_COLLECTION,
  filter:    () => EMPTY_COLLECTION,
  toCollection: () => EMPTY_COLLECTION,
};

function table(name) {
  const db = getActiveDb();
  if (!db) return EMPTY_TABLE;
  return db.table(name);
}

export const tables = {
  appointments: () => table('appointments'),
  patients:     () => table('patients'),
  reports:      () => table('reports'),
  personnel:    () => table('personnel'),
  invoices:     () => table('invoices'),
  expenses:     () => table('expenses'),
  referrers:           () => table('referrers'),
  referral_commissions:() => table('referral_commissions'),
  service_charges:     () => table('service_charges'),
  outbox:       () => table('outbox'),
  meta:         () => table('meta'),
};

// One-time cleanup of the pre-B2 unified database. Called from AuthContext
// the first time a user logs in after this code ships. Idempotent.
async function deleteLegacyDb() {
  try {
    await Dexie.delete(LEGACY_DB_NAME);
  } catch (_) {
    // legacy DB may not exist; that's fine
  }
}

// Whole-cache wipe for the clear-on-logout posture. Deletes EVERY known
// per-hospital DB plus the legacy v1 name. PHI hygiene: a shared front-desk
// machine shouldn't carry one user's worklist into the next user's session.
export async function clearLocalDatabase() {
  try {
    // Close every open instance before deleteDatabase so the calls don't
    // wait on long-running connections.
    for (const inst of instances.values()) {
      try { inst.close(); } catch (_) {}
    }
    // Enumerate persisted DBs and drop anything matching our prefix.
    if (typeof indexedDB?.databases === 'function') {
      const all = await indexedDB.databases();
      await Promise.all(all
        .filter(d => d?.name && (d.name.startsWith(DB_NAME_PREFIX) || d.name === LEGACY_DB_NAME))
        .map(d => Dexie.delete(d.name)));
    } else {
      // Older browsers without databases() — best effort: drop the
      // instances we know about + the legacy name.
      await Promise.all([
        ...Array.from(instances.keys()).map(k => Dexie.delete(`${DB_NAME_PREFIX}${k}`)),
        Dexie.delete(LEGACY_DB_NAME),
      ]);
    }
  } catch (err) {
    console.warn('[DB] Failed to clear local databases', err);
  } finally {
    instances.clear();
    activeHospitalId = null;
  }
}

// Exposed so AuthContext can fire this once on boot. Doing it lazily
// instead of at module-init time avoids ever blocking the SPA shell on
// an IDB call.
export async function purgeLegacyDb() {
  await deleteLegacyDb();
}
