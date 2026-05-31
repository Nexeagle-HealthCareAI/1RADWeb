// Offline-first local database — Phase B1.
//
// Why Dexie + IndexedDB and not localStorage:
//   • IndexedDB scales to gigabytes; localStorage caps at 5–10 MB and a
//     centre with a year of cached appointments would hit that ceiling.
//   • Dexie's liveQuery makes pages reactive — when SyncEngine writes a
//     new row from a delta pull, every component reading that resource
//     re-renders automatically without us plumbing a context.
//   • Real indexes mean date-range filtering ("today's worklist") is a
//     fast index scan, not a full-table loop in JS.
//
// Schema versioning rules:
//   • NEVER remove a field. The next Dexie open() detects the version
//     bump and runs the migration. If a field disappears, the user's
//     local data is silently dropped on update — clinical disaster.
//   • Each schema change increments the version number AND defines an
//     upgrade(). Even if the schema doesn't change shape, a version bump
//     is fine — Dexie ignores no-op upgrades.
//
// Eviction / quota:
//   • Phase B1 doesn't auto-evict. We rely on the worklist being a small
//     working set and on logout to clear (clear-on-logout posture).
//   • If a user exceeds quota, IndexedDB writes start throwing
//     QuotaExceededError; the SyncEngine catches these and surfaces a
//     banner. Eviction policy comes in B2.

import Dexie from 'dexie';

const DB_NAME = '1rad_offline_v1';

export const db = new Dexie(DB_NAME);

db.version(1).stores({
  // Compound indexes are declared as comma-separated strings; the FIRST
  // field is the primary key. The leading + on _localDirty would auto-
  // increment if we used it (we don't); plain field names create regular
  // indexes Dexie can use in queries.
  //
  // Appointments — keyed by appointmentId.
  //   • dateTime — drives "today's worklist" range filter
  //   • status — drives the active/archive splits
  //   • _updatedAtMs — drives delta pulls (the high-water mark we send
  //     as ?updatedAfter=). Stored as Number not Date because Dexie's
  //     range queries work cleaner on numbers.
  //   • _localDirty — outbox replay scans this to find rows to push
  appointments: 'appointmentId, dateTime, status, _updatedAtMs, _localDirty',

  // Single-row table holding sync engine bookkeeping. Key is a string
  // tag so we can keep multiple kinds of metadata in one table.
  //   • 'clockSkewMs' → { value: ms client is AHEAD of server }
  //   • 'lastPull_appointments' → { value: ISO of high-water mark }
  meta: '&key',
});

// v2 — Phase B1 Slice 2: cache Patients so the booking drawer's search
// works offline and the appointment cards have a name + identifier to
// render without a roundtrip. Same shape conventions as appointments:
//   • _updatedAtMs mirrors UpdatedAt for delta-pull math
//   • _localDirty marks rows the outbox still needs to push
// Search indexes (fullName, mobile, patientIdentifier) are lowercase
// mirrors maintained by the repo so case-insensitive prefix searches
// stay index-driven instead of falling back to a full-table loop.
db.version(2).stores({
  patients: 'patientId, _fullNameLower, _mobileLower, _patientIdentifierLower, _updatedAtMs, _localDirty',
});

// v3 — Phase B1 Slice 3: cache finalised + draft DiagnosticReports keyed by
// appointmentId (1:1 in this product — one report per appointment). With
// this in place the radiologist can re-open a prior report for any cached
// worklist row during a brief outage, and the autosaved local draft moves
// off localStorage (which caps at 5–10 MB) onto IndexedDB which has no
// practical ceiling for a single report.
//   • appointmentId — primary key (lookup by appointment, never by report id)
//   • isFinalized — split between "this is the gospel" and "draft" rows
//   • _updatedAtMs — delta-pull high-water mark
//   • _localDirty — set when the draft was written locally and the outbox
//                   hasn't pushed it yet
db.version(3).stores({
  reports: 'appointmentId, isFinalized, _updatedAtMs, _localDirty',
});

// v4 — Phase B1 Slice 4: snapshot of hospital personnel for the offline
// AppointmentBoard. Personnel is a small, slow-changing list (typically
// 5–50 rows per hospital, edited at most a few times a month) so we don't
// run a delta-fetch sync engine pull for it. Instead the page snapshots
// the full /personnel response into this table on every successful call
// and reads from it as the offline fallback. _snapshotAtMs is the time of
// the last successful refresh so a future surface can show how stale the
// cache is if the user is offline for a long stretch.
db.version(4).stores({
  personnel: 'userId, _snapshotAtMs',
});

// Convenience accessors. Repos use these instead of hitting db.* directly
// so that if we ever rename a table, only this file changes.
export const tables = {
  appointments: () => db.table('appointments'),
  patients:     () => db.table('patients'),
  reports:      () => db.table('reports'),
  personnel:    () => db.table('personnel'),
  meta:         () => db.table('meta'),
};

// Whole-database wipe for the clear-on-logout posture. Called by
// AuthContext.logout() — see CLAUDE.md / analysis doc for rationale.
// We deliberately use deleteDatabase rather than `db.tables.forEach(clear)`
// so the IndexedDB itself is gone, not just emptied — emptied stores still
// count against quota until the browser's GC reclaims them, and on
// shared front-desk computers the data shouldn't linger in any form.
export async function clearLocalDatabase() {
  try {
    db.close();
    await Dexie.delete(DB_NAME);
  } catch (err) {
    console.warn('[DB] Failed to delete local database', err);
  }
}
