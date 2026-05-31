// Dedicated Dexie database for device-local auth artefacts (PIN unlock).
//
// Why separate from the per-hospital DBs (1rad_offline_v1_<hospitalId>):
//   - A PIN follows the USER, not the hospital. A radiologist with access
//     to multiple hospitals has one PIN, not one per hospital.
//   - PIN data must survive hospital switches (a user switches centres
//     mid-session without re-authenticating).
//   - It must NOT survive logout (PHI hygiene — clearAuthDb wipes it
//     alongside the per-hospital caches via AuthContext.logout()).
//
// Why lazy access (authTable accessor instead of an exported singleton):
//   The first implementation exported `authDb = new Dexie(...)` and let
//   modules call `authDb.table('auth_pins')` directly. That worked until
//   logout: clearAuthDb() closes the Dexie instance, and any subsequent
//   write (after the next login) failed with "Database has been closed"
//   because the closed singleton was never replaced. Lazy access fixes
//   it — every table() call goes through ensureDb() which re-opens if
//   the previous instance was closed.
//
// Schema:
//   auth_pins:
//     userId       — primary key, the authenticated user's UUID
//     salt         — random 16 bytes, base64-encoded
//     hashB64      — PBKDF2-SHA256 derived bits, base64-encoded
//     iterations   — work factor used (250k by default)
//     algorithm    — 'PBKDF2-SHA256' (room to evolve)
//     session      — opaque session snapshot needed to bootstrap
//                    AuthContext offline (user object, token, refresh,
//                    centers, defaultCenterId, capturedAt timestamp)
//     failedAttempts
//     lockedUntilMs — epoch ms when current lockout expires (0 = unlocked)
//     lockoutRound  — how many lockouts have happened in a row; reset on
//                     successful unlock. After ROUND_CAP rounds the PIN is
//                     deleted and the user must log in online to set a new one.
//     createdAtMs

import Dexie from 'dexie';

const DB_NAME = '1rad_auth_v1';

let _db = null;

function ensureDb() {
  // Recreate if absent or if the previous instance was closed (clearAuthDb
  // sets _db = null after closing, but defence in depth: Dexie's isOpen()
  // tells us if it's usable).
  if (!_db || (typeof _db.isOpen === 'function' && !_db.isOpen() && !_db._isOpening)) {
    _db = new Dexie(DB_NAME);
    _db.version(1).stores({
      auth_pins: 'userId, createdAtMs',
    });
  }
  return _db;
}

// Public accessor. Use this in place of `authDb.table(...)`.
export function authTable(name) {
  return ensureDb().table(name);
}

// Whole-DB wipe. Called by AuthContext.logout() so a shared device doesn't
// carry one user's PIN into the next user's session. Idempotent.
// After this returns, the next call to authTable() opens a fresh DB.
export async function clearAuthDb() {
  const prev = _db;
  // Null out FIRST so any in-flight access reads through ensureDb() which
  // will open a new (empty) DB rather than touching the doomed instance.
  _db = null;
  try {
    if (prev) {
      try { prev.close(); } catch (_) {}
    }
    await Dexie.delete(DB_NAME);
  } catch (err) {
    console.warn('[authDb] failed to clear', err?.message || err);
  }
}
