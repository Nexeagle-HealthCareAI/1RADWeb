// PIN-unlock primitives for offline re-entry.
//
// The PIN never leaves the device. Setup happens after a successful online
// login: the user picks a 4-digit code, we derive a PBKDF2-SHA256 hash
// (250k iterations) over a random salt and stash hash + salt + the current
// session snapshot in authDb. Subsequent visits compare a freshly entered
// PIN against the stored hash; on match we restore the cached session
// without a server round-trip.
//
// Failure handling:
//   - Wrong PIN bumps failedAttempts. After ATTEMPTS_PER_ROUND (5) wrong
//     in a row, the slot is locked for LOCKOUT_MINUTES (5 min).
//   - Each completed lockout bumps lockoutRound. After ROUND_CAP (3) rounds
//     - 15 wrong total - the PIN slot is deleted entirely and the user
//     must log in online to set a new PIN.
//   - A successful unlock resets failedAttempts, lockedUntilMs, and
//     lockoutRound. Clean slate.
//
// JWT expiry: when restoring a cached session we decode the access token's
// `exp` claim. If already past, the unlock is refused and the slot is
// cleared - PIN-unlocking into an instantly-401-ing session is a worse UX
// than just telling the user to log in fresh.

import { authTable } from './authDb';

const PBKDF2_ITERATIONS  = 250_000;
const SALT_BYTES         = 16;
const HASH_BITS          = 256;
const ATTEMPTS_PER_ROUND = 5;
const LOCKOUT_MINUTES    = 5;
const ROUND_CAP          = 3;

// --- Encoding helpers --------------------------------------------------------

function toB64(bytes) {
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

// --- Crypto ------------------------------------------------------------------

async function derive(pin, saltBytes, iterations = PBKDF2_ITERATIONS) {
  // Web Crypto requires the password as a CryptoKey before derive. The PIN
  // is a string of digits; we encode as UTF-8 bytes for hashing input.
  const enc = new TextEncoder().encode(pin);
  const key = await crypto.subtle.importKey(
    'raw', enc, { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    key,
    HASH_BITS
  );
  return new Uint8Array(bits);
}

// Constant-time-ish comparison. JavaScript's array compare short-circuits,
// which leaks timing information. This loops over every byte regardless.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function isValidPinShape(pin) {
  return typeof pin === 'string' && /^\d{4,6}$/.test(pin);
}

// Decode a JWT's payload without verifying signature - we only need the
// `exp` field. A malformed token returns null.
function decodeJwtPayload(token) {
  try {
    const parts = (token || '').split('.');
    if (parts.length < 2) return null;
    // base64url -> base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch { return null; }
}

// --- Public API --------------------------------------------------------------

// Register a PIN for the given user. Caller supplies the SESSION SNAPSHOT
// (a serialisable object — user, access token, refresh token, centers,
// defaultCenterId) so a later unlock can fully restore AuthContext without
// any API round-trip.
export async function setPin(userId, pin, sessionSnapshot) {
  if (!userId) throw new Error('userId required');
  if (!isValidPinShape(pin)) throw new Error('PIN must be 4-6 digits');
  if (!sessionSnapshot) throw new Error('sessionSnapshot required');

  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, saltBytes);

  await authTable('auth_pins').put({
    userId,
    salt: toB64(saltBytes),
    hashB64: toB64(hash),
    iterations: PBKDF2_ITERATIONS,
    algorithm: 'PBKDF2-SHA256',
    session: { ...sessionSnapshot, capturedAtMs: Date.now() },
    failedAttempts: 0,
    lockedUntilMs: 0,
    lockoutRound: 0,
    createdAtMs: Date.now(),
  });
}

// Returns { success, session?, reason?, lockUntilMs?, attemptsLeft?, removed? }.
// On success: callers restore AuthContext from `session`.
// On lockout: `lockUntilMs` says when to unlock.
// On removed: the PIN slot was deleted (cap hit) — user must log in online.
export async function verifyPin(userId, pin) {
  if (!userId || !isValidPinShape(pin)) {
    return { success: false, reason: 'invalid-shape' };
  }
  const t = authTable('auth_pins');
  const row = await t.get(userId);
  if (!row) return { success: false, reason: 'no-pin' };

  // Currently locked?
  const now = Date.now();
  if (row.lockedUntilMs && row.lockedUntilMs > now) {
    return { success: false, reason: 'locked', lockUntilMs: row.lockedUntilMs };
  }

  // Compute and compare.
  const saltBytes  = fromB64(row.salt);
  const expectedB = fromB64(row.hashB64);
  const computed  = await derive(pin, saltBytes, row.iterations || PBKDF2_ITERATIONS);
  const ok = safeEqual(computed, expectedB);

  if (!ok) {
    const nextAttempts = (row.failedAttempts || 0) + 1;
    if (nextAttempts >= ATTEMPTS_PER_ROUND) {
      const nextRound = (row.lockoutRound || 0) + 1;
      if (nextRound >= ROUND_CAP) {
        // Cap hit — wipe the PIN. Force online login.
        await t.delete(userId);
        return { success: false, reason: 'removed' };
      }
      const lockUntilMs = now + LOCKOUT_MINUTES * 60_000;
      await t.update(userId, {
        failedAttempts: 0,
        lockedUntilMs: lockUntilMs,
        lockoutRound: nextRound,
      });
      return { success: false, reason: 'locked', lockUntilMs };
    }
    await t.update(userId, { failedAttempts: nextAttempts });
    return {
      success: false,
      reason: 'wrong',
      attemptsLeft: ATTEMPTS_PER_ROUND - nextAttempts,
    };
  }

  // Correct PIN — check the cached JWT hasn't already expired before we
  // hand the session back to the caller.
  const exp = decodeJwtPayload(row.session?.accessToken)?.exp;
  if (typeof exp === 'number' && Date.now() / 1000 >= exp - 30 /* small skew */) {
    // Expired — purge the cache and force online login.
    await t.delete(userId);
    return { success: false, reason: 'session-expired' };
  }

  // Reset all attempt counters and return the snapshot.
  await t.update(userId, { failedAttempts: 0, lockedUntilMs: 0, lockoutRound: 0 });
  return { success: true, session: row.session };
}

// Remove a single user's PIN (logout-time cleanup is the primary caller).
export async function removePin(userId) {
  if (!userId) return;
  try { await authTable('auth_pins').delete(userId); }
  catch (err) { console.warn('[pinAuth] removePin failed', err?.message || err); }
}

// Has any user registered a PIN on this device? Used by LoginPage to
// decide whether to show the PIN entry surface as the default.
export async function listPinUsers() {
  try {
    const rows = await authTable('auth_pins').toArray();
    return rows.map(r => ({
      userId: r.userId,
      name: r.session?.user?.name || r.session?.user?.email || 'Saved user',
      lockedUntilMs: r.lockedUntilMs || 0,
    }));
  } catch { return []; }
}

// Whether the given user has a PIN slot at all.
export async function hasPin(userId) {
  if (!userId) return false;
  try { return !!(await authTable('auth_pins').get(userId)); }
  catch { return false; }
}

// Safe metadata read for the Settings page. Returns null if no slot;
// otherwise the fields the UI needs to show "PIN is enabled" status WITHOUT
// exposing salt / hash / cached session.
export async function getPinInfo(userId) {
  if (!userId) return null;
  try {
    const row = await authTable('auth_pins').get(userId);
    if (!row) return null;
    return {
      createdAtMs:   row.createdAtMs || 0,
      lockedUntilMs: row.lockedUntilMs || 0,
      lockoutRound:  row.lockoutRound || 0,
      algorithm:     row.algorithm || 'PBKDF2-SHA256',
      iterations:    row.iterations || PBKDF2_ITERATIONS,
    };
  } catch { return null; }
}
