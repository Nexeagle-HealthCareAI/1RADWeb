// Sync coordinator — single source of truth for "when do we talk to the
// network and what do we ask for?" for the offline-first cache.
//
// Phase B1 responsibilities (kept small on purpose):
//   1. On boot, measure clock skew so updatedAfter filters use a normalised
//      timestamp instead of the user's potentially-wrong laptop clock.
//   2. On boot AND every 30s online, pull deltas for the resources we
//      know how to cache (currently just appointments).
//   3. On `online` event, trigger immediate sync — the user just got back
//      to wifi, they don't want to wait 30s for the worklist to refresh.
//   4. Keep its own "is currently syncing" flag so two concurrent pulls
//      never race on the same resource.
//
// What it does NOT do (yet):
//   • Push outbox — that's already handled by useOffline.performSync().
//     A future B2 task is to unify them under this engine.
//   • Conflict resolution UI — for B1 we are last-write-wins (the existing
//     posture); B2 wires the optimistic-concurrency + dialog.
//   • Quota awareness banner — B2.

import apiClient from '../api/apiClient';
import {
  applyServerDeltas as applyAppointmentDeltas,
  highWatermarkIso  as appointmentsHighWatermarkIso,
} from '../db/repos/appointmentsRepo';
import {
  applyServerDeltas as applyPatientDeltas,
  highWatermarkIso  as patientsHighWatermarkIso,
} from '../db/repos/patientsRepo';
import {
  applyServerDeltas as applyReportDeltas,
  highWatermarkIso  as reportsHighWatermarkIso,
} from '../db/repos/reportsRepo';
import { tables } from '../db/dexie';

const PULL_INTERVAL_MS = 30_000;

let started = false;
let pollTimer = null;
let pulling = false;

// --- Clock skew --------------------------------------------------------------
// The server returns ISO UTC; the client may be hours off. We measure once on
// each engine start and persist the offset so every updatedAfter we send is
// normalised. Without this, a laptop with a wrong clock pulls "everything
// since 1970" or "nothing ever again" depending on which way it's off.

async function measureClockSkew() {
  try {
    const t0 = Date.now();
    const res = await apiClient.get('/system/now');
    const t1 = Date.now();
    const serverNow = new Date(res?.data?.utcNow).getTime();
    if (!Number.isFinite(serverNow)) return;
    // Round-trip time approximated as t1 - t0; server-observed moment was
    // somewhere in the middle of that window. Use t0 + rtt/2 as our local
    // estimate of "when the server's clock read serverNow".
    const localAtServerNow = t0 + (t1 - t0) / 2;
    const skewMs = localAtServerNow - serverNow; // positive = client ahead
    await tables.meta().put({ key: 'clockSkewMs', value: skewMs });
    if (Math.abs(skewMs) > 60_000) {
      console.warn(`[SYNC] Clock skew is ${Math.round(skewMs / 1000)}s — sync filters will be adjusted.`);
    }
  } catch (err) {
    // Best-effort; if /system/now isn't reachable we just skip skew
    // adjustment and assume the local clock is fine. Worst case the user
    // gets a slightly larger delta on first reconnect.
    console.warn('[SYNC] Clock-skew measurement failed', err?.message || err);
  }
}

async function getSkewMs() {
  const row = await tables.meta().get('clockSkewMs');
  return Number.isFinite(row?.value) ? row.value : 0;
}

// --- Appointments delta pull -------------------------------------------------

async function pullAppointments() {
  // Use the in-DB high-water mark, NOT the local clock. This survives any
  // amount of clock skew because both sides are speaking in the server's
  // time domain (server stamped UpdatedAt, client just remembers it).
  const since = await appointmentsHighWatermarkIso();
  const params = {};
  if (since) params.updatedAfter = since;
  // Sync engine always asks for tombstones so it can apply DELETE semantics
  // to the local cache.
  params.includeDeleted = true;

  const res = await apiClient.get('/appointments', { params });
  const rows = Array.isArray(res?.data) ? res.data : [];
  const stats = await applyAppointmentDeltas(rows);

  if (stats.applied || stats.deleted) {
    console.info(`[SYNC] Appointments: +${stats.applied} ~${stats.deleted} (since ${since || 'epoch'})`);
  }
  return stats;
}

// --- Patients delta pull -----------------------------------------------------

async function pullPatients() {
  const since = await patientsHighWatermarkIso();
  const params = { includeDeleted: true };
  if (since) params.updatedAfter = since;

  const res = await apiClient.get('/patients', { params });
  const rows = Array.isArray(res?.data) ? res.data : [];
  const stats = await applyPatientDeltas(rows);

  if (stats.applied || stats.deleted) {
    console.info(`[SYNC] Patients: +${stats.applied} ~${stats.deleted} (since ${since || 'epoch'})`);
  }
  return stats;
}

// --- Reports delta pull ------------------------------------------------------

async function pullReports() {
  const since = await reportsHighWatermarkIso();
  const params = { includeDeleted: true };
  if (since) params.updatedAfter = since;

  const res = await apiClient.get('/reporting/reports', { params });
  const rows = Array.isArray(res?.data) ? res.data : [];
  const stats = await applyReportDeltas(rows);

  if (stats.applied || stats.deleted) {
    console.info(`[SYNC] Reports: +${stats.applied} ~${stats.deleted} (since ${since || 'epoch'})`);
  }
  return stats;
}

// Single coordinated pull cycle. Adding more resources here is the B2
// extension point — each just gets one more await in the right order.
// Order matters: appointments first because the user-visible worklist is
// the highest-priority paint; patients second so booking drawer search
// works as soon as the worklist is on screen; reports last because they're
// only consulted when the radiologist opens a specific row.
async function pullCycle() {
  if (pulling) return;
  if (!navigator.onLine) return;
  pulling = true;
  try {
    await pullAppointments();
    await pullPatients();
    await pullReports();
    await tables.meta().put({ key: 'lastSuccessfulPullAt', value: new Date().toISOString() });
  } catch (err) {
    // Surface but don't throw — the engine must survive a single bad pull.
    // The next interval try will pick up wherever we left off.
    console.warn('[SYNC] Pull cycle failed', err?.message || err);
  } finally {
    pulling = false;
  }
}

// --- Lifecycle ---------------------------------------------------------------

export function startSyncEngine() {
  if (started) return;
  started = true;

  // Measure clock skew once on boot, kick a pull immediately, then poll.
  (async () => {
    await measureClockSkew();
    await pullCycle();
  })();

  pollTimer = setInterval(pullCycle, PULL_INTERVAL_MS);

  // Reconnect: drop the wait until next interval — pull right away.
  const onOnline = () => pullCycle();
  window.addEventListener('online', onOnline);

  // Save the cleanup off the engine so a future hot-reload or test harness
  // can shut it down cleanly.
  startSyncEngine._cleanup = () => {
    started = false;
    if (pollTimer) clearInterval(pollTimer);
    window.removeEventListener('online', onOnline);
  };

  console.info(`[SYNC] Engine started (interval ${PULL_INTERVAL_MS / 1000}s)`);
}

export function stopSyncEngine() {
  if (startSyncEngine._cleanup) startSyncEngine._cleanup();
}

// Useful for components that want to fire a pull on user gesture (e.g.
// pull-to-refresh on a worklist).
export async function syncNow() {
  await pullCycle();
}

// Exported for diagnostics / debugging.
export async function getSyncDebugInfo() {
  return {
    online: navigator.onLine,
    pulling,
    skewMs: await getSkewMs(),
    lastPullAt: (await tables.meta().get('lastSuccessfulPullAt'))?.value || null,
    appointmentsHighWater: await appointmentsHighWatermarkIso(),
    patientsHighWater:     await patientsHighWatermarkIso(),
    reportsHighWater:      await reportsHighWatermarkIso(),
  };
}
