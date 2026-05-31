// Sync telemetry — Phase B2 Track 8.
//
// Per the B2 decision, telemetry is local-first: console for live tail +
// a Dexie ring buffer for replay. No external service. When a user reports
// "sync is broken" we can:
//   • Have them open DevTools and read the console log (live).
//   • Or ask them to copy-paste `window.__syncTelemetry()` output, which
//     dumps the last 200 events stored in the active hospital's Dexie
//     meta row.
//
// Why a ring buffer in the meta row vs. its own table:
//   • The decision earlier in the session was explicit: "Console + Dexie
//     ring buffer". A new table would mean another schema version bump
//     for what is essentially a debug aid.
//   • The buffer is bounded (200 events) so the meta row stays small even
//     after weeks of telemetry.
//   • Per-hospital — telemetry follows the cache DB, mirroring the
//     "everything per-hospital after Track 5" pattern.
//
// Event shape: { at: ISO, event: string, payload?: object }.

import { tables, getActiveHospitalId } from '../db/dexie';

const META_KEY = 'telemetry';
const RING_LIMIT = 200;

let inflight = Promise.resolve();

export async function logEvent(event, payload) {
  // Always log to console — visible immediately in DevTools without a
  // round-trip through IndexedDB. The console prefix makes it greppable.
  // eslint-disable-next-line no-console
  console.info(`[TELEM] ${event}`, payload ?? '');

  // No hospital yet → skip the persisted write. The cache stub would
  // silently no-op anyway; this avoids an unnecessary round-trip.
  if (!getActiveHospitalId()) return;

  // Serialize writes so two near-simultaneous events can't lose each
  // other via read-modify-write race. Telemetry isn't on the hot path
  // so a single-flight queue is fine.
  inflight = inflight.then(async () => {
    try {
      const t = tables.meta();
      const row = await t.get(META_KEY);
      const list = Array.isArray(row?.value) ? row.value : [];
      list.push({ at: new Date().toISOString(), event, payload: payload ?? null });
      // Ring-trim from the head when over the cap. push+slice is O(n) but
      // n ≤ 200 so noise is in the microseconds.
      const trimmed = list.length > RING_LIMIT ? list.slice(list.length - RING_LIMIT) : list;
      await t.put({ key: META_KEY, value: trimmed });
    } catch (err) {
      // Telemetry must never throw into the caller. Best-effort.
      // eslint-disable-next-line no-console
      console.warn('[TELEM] persist failed', err?.message || err);
    }
  });
  return inflight;
}

export async function getRecentEvents() {
  if (!getActiveHospitalId()) return [];
  try {
    const row = await tables.meta().get(META_KEY);
    return Array.isArray(row?.value) ? row.value : [];
  } catch {
    return [];
  }
}

// Browser-console helper. The user can paste their telemetry by typing
// `await __syncTelemetry()` in DevTools. Mounted on window so it works
// across hot-reloads.
if (typeof window !== 'undefined') {
  window.__syncTelemetry = getRecentEvents;
}
