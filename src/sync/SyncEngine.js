// Sync coordinator — owns both directions of the wire (pull deltas down,
// push outbox up). Phase B2 Track 1 absorbed the push path that used to
// live independently in useOffline.performSync().
//
// Responsibilities:
//   1. On boot: measure clock skew, pull all deltas, then drain the outbox.
//   2. Every 30s online: pull deltas. Push runs as part of syncNow() but
//      not on the steady-state pull tick (no need to constantly check an
//      empty queue).
//   3. On 'online' event: pushCycle → pullCycle. Order matters — the push
//      sends queued mutations FIRST so when the pull lands, it gets the
//      canonical server version including those mutations.
//   4. After every successful enqueue from useOffline.addToOutbox: a
//      single shot at pushCycle so the queued mutation lands immediately
//      when we're online; if we're offline it no-ops.
//
// Concurrency: shared mutex between pull and push. Two pulls can never
// race, nor can two pushes, nor can a push and a pull on the same DB.
// The mutex is named `pulling` for backwards-compat with the B1 export
// shape but it actually gates both directions.
//
// What this engine still does NOT do (deferred to later B2 tracks):
//   • Optimistic concurrency / conflict resolution UI (Track 3).
//   • Storage quota awareness (Track 4).
//   • Hard-offline boot via SW (out of scope per Track 6 deferral).

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
  clearLocalDirty   as clearReportLocalDirty,
} from '../db/repos/reportsRepo';
import {
  listPending  as outboxListPending,
  remove       as outboxRemove,
  markFailure  as outboxMarkFailure,
  markPoisoned as outboxMarkPoisoned,
  rewriteTempIds as outboxRewriteTempIds,
} from '../db/repos/outboxRepo';
import { tables, getActiveHospitalId } from '../db/dexie';
import { evictAggressively, startQuotaMonitor } from './quotaMonitor';
import { logEvent } from './syncTelemetry';

const PULL_INTERVAL_MS = 30_000;
const MAX_RETRY_ATTEMPTS = 5;

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

// Run a delta-apply call, and if IndexedDB rejects with QuotaExceededError
// shed old data and retry once. Used for every pull below.
//
// Why retry-once: the eviction drops month-old (then week-old) rows so
// the second try has free space. If it STILL fails we surrender — the
// monitor's banner will already be telling the user the cache is full,
// and the pull will simply skip until the user clears space.
async function withQuotaRetry(label, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err?.name === 'QuotaExceededError' || /QuotaExceeded/i.test(String(err?.message))) {
      console.warn(`[SYNC] ${label} hit QuotaExceededError — evicting.`);
      try { await evictAggressively(); } catch (_) {}
      try { return await fn(); }
      catch (err2) {
        console.warn(`[SYNC] ${label} still failing after eviction — skipping this cycle.`, err2?.message || err2);
        return null;
      }
    }
    throw err;
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
  const stats = await withQuotaRetry('appointments', () => applyAppointmentDeltas(rows));
  if (stats == null) return { applied: 0, deleted: 0 };

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
  const stats = await withQuotaRetry('patients', () => applyPatientDeltas(rows));
  if (stats == null) return { applied: 0, deleted: 0 };

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
  const stats = await withQuotaRetry('reports', () => applyReportDeltas(rows));
  if (stats == null) return { applied: 0, deleted: 0 };

  if (stats.applied || stats.deleted) {
    console.info(`[SYNC] Reports: +${stats.applied} ~${stats.deleted} (since ${since || 'epoch'})`);
  }
  return stats;
}

// --- Outbox push -------------------------------------------------------------
//
// Routes each queued mutation to the right endpoint and method. New
// outbox types are added here only — useOffline.addToOutbox is type-agnostic.
function resolveRoute(item) {
  const p = item.payload;
  switch (item.type) {
    case 'INVOICE':              return { method: 'POST',   url: '/finance/invoices' };
    case 'EXPENSE':              return { method: 'POST',   url: '/finance/expense' };
    case 'PAYMENT':              return { method: 'POST',   url: '/finance/payments' };
    case 'REPORT':               return { method: 'POST',   url: '/reporting/save' };
    case 'PRICE_UPDATE':         return { method: 'POST',   url: '/finance/registry' };
    case 'PAYOUT':               return { method: 'POST',   url: '/referrers/commissions' };
    case 'HOSPITAL_UPDATE':      return { method: 'PUT',    url: `/hospitals/${p.id}` };
    case 'PERSONNEL_CREATE':     return { method: 'POST',   url: '/personnel' };
    case 'PERSONNEL_UPDATE':     return { method: 'PUT',    url: `/personnel/${p.id}` };
    case 'PERSONNEL_DELETE':     return { method: 'DELETE', url: `/personnel/${p.id}` };
    case 'CHAIN_DEPLOY':         return { method: 'POST',   url: '/hospitals/chain' };
    case 'PRICE_DELETE':         return { method: 'DELETE', url: `/finance/registry/${p.id}` };
    case 'EXPENSE_DELETE':       return { method: 'DELETE', url: `/finance/expenses/${p.id}` };
    case 'INVOICE_DELETE':       return { method: 'DELETE', url: `/finance/invoices/${p.id}` };
    case 'PRESCRIPTION_UPDATE':  return { method: 'POST',   url: '/Prescription' };
    case 'APPOINTMENT_CREATE':   return { method: 'POST',   url: '/appointments' };
    case 'APPOINTMENT_STATUS':   return { method: 'PATCH',  url: `/appointments/${p.id}/status`,
                                          // server expects a raw JSON string for this endpoint
                                          body: JSON.stringify(p.status),
                                          headers: { 'Content-Type': 'application/json' } };
    case 'PATIENT_CREATE':       return { method: 'POST',   url: '/patients' };
    default: return null;
  }
}

async function sendOutboxItem(item) {
  const route = resolveRoute(item);
  if (!route) throw new Error(`Unknown outbox type: ${item.type}`);
  const body = route.body !== undefined ? route.body : item.payload;
  const config = {
    headers: {
      // Idempotency-Key is the Track 2 prereq — a retried push is a no-op
      // server-side instead of producing a duplicate. The header is harmless
      // on backends that don't implement dedupe yet.
      'Idempotency-Key': item.idempotencyKey,
      ...(route.headers || {}),
    },
  };
  switch (route.method) {
    case 'POST':   return apiClient.post(route.url,   body, config);
    case 'PUT':    return apiClient.put(route.url,    body, config);
    case 'PATCH':  return apiClient.patch(route.url,  body, config);
    case 'DELETE': return apiClient.delete(route.url, config);
    default: throw new Error(`Unsupported method ${route.method}`);
  }
}

// Drains the per-hospital outbox in FIFO order. Returns aggregate stats.
// Failures: 404 poisons immediately (no point retrying a gone endpoint);
// transient errors bump attempts and the item goes back into the queue.
// After MAX_RETRY_ATTEMPTS the item is poisoned so it stops spamming.
async function pushCycle() {
  if (!navigator.onLine) return { sent: 0, failed: 0, poisoned: 0 };
  if (!getActiveHospitalId()) return { sent: 0, failed: 0, poisoned: 0 };

  const pending = await outboxListPending();
  if (pending.length === 0) return { sent: 0, failed: 0, poisoned: 0 };

  const stats = { sent: 0, failed: 0, poisoned: 0 };
  // patientId tempId → realId map built during PATIENT_CREATE successes;
  // applied to the queue immediately so a same-cycle APPOINTMENT_CREATE
  // that references the tempId picks up the real id before its turn.
  const tempIdMap = {};

  for (const item of pending) {
    try {
      const response = await sendOutboxItem(item);

      if (item.type === 'PATIENT_CREATE' && response?.data?.patientId && item.payload?.tempId) {
        tempIdMap[item.payload.tempId] = response.data.patientId;
        await outboxRewriteTempIds({ [item.payload.tempId]: response.data.patientId });
      }

      // Phase B1 Slice 3 — a REPORT push that just succeeded should clear
      // the local _localDirty flag so the next pull is allowed to overwrite
      // the cached row with the canonical server copy.
      if (item.type === 'REPORT' && item.payload?.appointmentId) {
        try { await clearReportLocalDirty(item.payload.appointmentId); } catch (_) {}
      }

      await outboxRemove(item.id);
      stats.sent++;
    } catch (err) {
      const status = err?.response?.status;
      const errMsg = err?.response?.data?.error || err?.message || String(err);
      const isPermanent = status === 404;
      const attempts = (item.attempts || 0) + 1;
      if (isPermanent || attempts >= MAX_RETRY_ATTEMPTS) {
        console.error(`[SYNC] Poisoning outbox ${item.id} (type=${item.type}) after ${attempts} attempt(s). Status=${status}. Server: ${errMsg}`);
        await outboxMarkPoisoned(item.id, `${status}: ${errMsg}`);
        stats.poisoned++;
      } else {
        await outboxMarkFailure(item.id, errMsg, attempts);
        console.warn(`[SYNC] Outbox push failed for ${item.id} (attempt ${attempts}/${MAX_RETRY_ATTEMPTS})`, err?.message || err);
        stats.failed++;
      }
    }
  }

  if (stats.sent) {
    console.info(`[SYNC] Outbox: ${stats.sent} sent, ${stats.failed} failed, ${stats.poisoned} poisoned`);
  }
  if (stats.sent || stats.failed || stats.poisoned) {
    logEvent('push.cycle', stats);
  }
  if (stats.poisoned) {
    logEvent('push.poison', { count: stats.poisoned });
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
  // B2 Track 5 — don't waste a network request when there's no active
  // hospital yet (post-logout window, or pre-centre-resolution boot).
  // tables.* would silently no-op anyway, but the GET still goes out.
  if (!getActiveHospitalId()) return;
  pulling = true;
  const startedAt = Date.now();
  try {
    await pullAppointments();
    await pullPatients();
    await pullReports();
    await tables.meta().put({ key: 'lastSuccessfulPullAt', value: new Date().toISOString() });
    logEvent('pull.cycle', { ok: true, ms: Date.now() - startedAt });
  } catch (err) {
    // Surface but don't throw — the engine must survive a single bad pull.
    // The next interval try will pick up wherever we left off.
    console.warn('[SYNC] Pull cycle failed', err?.message || err);
    logEvent('pull.failure', { ms: Date.now() - startedAt, message: err?.message || String(err) });
  } finally {
    pulling = false;
  }
}

// Push then pull, in that order. Order matters: pushing first lands queued
// mutations on the server, so when the pull comes back it brings down the
// canonical server version (with the just-pushed rows included). If we
// pulled first, the local cache would briefly miss the push's effect until
// the NEXT pull tick — 30s of visible lag.
async function pushAndPullCycle() {
  if (pulling) return;
  pulling = true;
  try {
    const stats = await pushCycle();
    // Only re-pull when the push actually shipped something. Otherwise the
    // 30s pull tick is already keeping things fresh; no need to double up.
    if (stats.sent > 0) {
      await pullAppointments();
      await pullPatients();
      await pullReports();
      await tables.meta().put({ key: 'lastSuccessfulPullAt', value: new Date().toISOString() });
    }
  } catch (err) {
    console.warn('[SYNC] Push/pull cycle failed', err?.message || err);
  } finally {
    pulling = false;
  }
}

// --- Lifecycle ---------------------------------------------------------------

export function startSyncEngine() {
  if (started) return;
  started = true;

  // Boot sequence: measure clock skew, then push anything queued from a
  // prior offline session, then pull deltas. Doing push BEFORE pull means
  // the queued mutations land server-side first, so the very next pull
  // sees them in the canonical state.
  (async () => {
    await measureClockSkew();
    await pushAndPullCycle();
    await pullCycle();
  })();

  // B2 Track 4 — proactive quota monitoring. Polls usage; sheds old data
  // before the cache fills. Idempotent.
  startQuotaMonitor();

  pollTimer = setInterval(pullCycle, PULL_INTERVAL_MS);

  // Reconnect: push queued mutations first, then pull. Single listener
  // (B1 had two — one here, one in useOffline — which fired in parallel
  // and could race).
  const onOnline = () => pushAndPullCycle();
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

// User-gesture refresh (pull-to-refresh on worklist, post-mutation nudge).
// Runs the full push-then-pull cycle so a refresh tap also picks up any
// queued mutations and pushes them.
export async function syncNow() {
  await pushAndPullCycle();
  // Always fire a pull regardless of push outcome — the user gesture
  // implies "show me the freshest state."
  await pullCycle();
}

// Lightweight nudge for the addToOutbox path: just drain the queue.
// Returns the push stats so callers can show a toast.
export async function syncPushNow() {
  return pushCycle();
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
