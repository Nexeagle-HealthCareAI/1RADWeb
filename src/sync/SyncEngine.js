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
  applyServerDeltas as applyInvoiceDeltas,
  highWatermarkIso  as invoicesHighWatermarkIso,
  evictOlderThan    as evictInvoices,
} from '../db/repos/invoicesRepo';
import {
  applyServerDeltas as applyExpenseDeltas,
  highWatermarkIso  as expensesHighWatermarkIso,
  evictOlderThan    as evictExpenses,
} from '../db/repos/expensesRepo';
import {
  applyServerDeltas as applyReferrerDeltas,
  highWatermarkIso  as referrersHighWatermarkIso,
} from '../db/repos/referrersRepo';
import {
  applyServerDeltas as applyCommissionDeltas,
  highWatermarkIso  as commissionsHighWatermarkIso,
  evictOlderThan    as evictReferralCommissions,
} from '../db/repos/referralCommissionsRepo';
import { snapshotPersonnel } from '../db/repos/personnelRepo';
import { snapshotServiceCharges } from '../db/repos/serviceChargesRepo';
import {
  listPending   as outboxListPending,
  remove        as outboxRemove,
  markFailure   as outboxMarkFailure,
  markPoisoned  as outboxMarkPoisoned,
  clearBackoff  as outboxClearBackoff,
  rewriteTempIds as outboxRewriteTempIds,
} from '../db/repos/outboxRepo';
import { tables, getActiveHospitalId } from '../db/dexie';
import { evictAggressively, startQuotaMonitor } from './quotaMonitor';
import { logEvent } from './syncTelemetry';

const PULL_INTERVAL_MS = 30_000;

// --- Auto-retry back-off -----------------------------------------------------
// A transient failure (network drop, server busy, 5xx, timeout) is retried
// automatically, forever, with a capped exponential back-off. We never give up
// on the user's queued change just because the server was briefly unreachable —
// dropping a clinical write would be far worse than retrying it a minute later.
const RETRY_BASE_MS = 5_000;          // first retry ~5s out
const RETRY_CAP_MS  = 5 * 60_000;     // never wait longer than 5 minutes

function backoffMs(attempts) {
  const exp = RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(exp, RETRY_CAP_MS);
}

// Decide whether a failed push is worth retrying on its own.
//   • transient  → no response at all (offline / DNS / timeout), 408, 429, or
//                  any 5xx. The server might just be busy or mid-deploy; retry.
//   • permanent  → any other 4xx (400/401/403/404/409/422…). The request is
//                  wrong in a way a retry can't fix; surface it for a human.
function isTransientError(err) {
  const status = err?.response?.status;
  if (status == null) return true;
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

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

// --- Invoices delta pull -----------------------------------------------------
// Progressive strategy:
//   Phase A (cold boot): pull the most-recent RECENT_DAYS_WINDOW days first
//   so the Revenue Hub renders real data instantly, even on a large clinic.
//   Phase B (background): the full-history pull runs after a short delay.
//   Steady-state 30s tick: always uses updatedAfter watermark (tiny delta).

const RECENT_DAYS_WINDOW = 30; // days to pull on a fast first-page load

async function pullInvoices({ recentOnly = false } = {}) {
  const since = await invoicesHighWatermarkIso();
  const params = { includeDeleted: true };
  if (since) params.updatedAfter = since;

  // On cold boot with no cached data AND recentOnly mode, scope to the last
  // RECENT_DAYS_WINDOW days so the initial pull is small and fast. The
  // full-history pull follows 5 s later on the same boot cycle (Phase B).
  if (recentOnly && !since) {
    const cutoff = new Date(Date.now() - RECENT_DAYS_WINDOW * 24 * 3600 * 1000);
    params.startDate = cutoff.toISOString();
  }

  const res = await apiClient.get('/finance/invoices', { params });
  const rows = Array.isArray(res?.data) ? res.data : [];
  const stats = await withQuotaRetry('invoices', () => applyInvoiceDeltas(rows));
  if (stats == null) return { applied: 0, deleted: 0 };

  if (stats.applied || stats.deleted) {
    const tag = recentOnly && !since ? ` [Phase A — last ${RECENT_DAYS_WINDOW}d]` : '';
    console.info(`[SYNC] Invoices${tag}: +${stats.applied} ~${stats.deleted} (since ${since || 'epoch'})`);
  }
  return stats;
}

// --- Expenses delta pull -----------------------------------------------------

async function pullExpenses({ recentOnly = false } = {}) {
  const since = await expensesHighWatermarkIso();
  const params = { includeDeleted: true };
  if (since) params.updatedAfter = since;

  if (recentOnly && !since) {
    const cutoff = new Date(Date.now() - RECENT_DAYS_WINDOW * 24 * 3600 * 1000);
    params.startDate = cutoff.toISOString();
  }

  const res = await apiClient.get('/finance/expenses', { params });
  const rows = Array.isArray(res?.data) ? res.data : [];
  const stats = await withQuotaRetry('expenses', () => applyExpenseDeltas(rows));
  if (stats == null) return { applied: 0, deleted: 0 };

  if (stats.applied || stats.deleted) {
    const tag = recentOnly && !since ? ` [Phase A — last ${RECENT_DAYS_WINDOW}d]` : '';
    console.info(`[SYNC] Expenses${tag}: +${stats.applied} ~${stats.deleted} (since ${since || 'epoch'})`);
  }
  return stats;
}

// --- Referrers delta pull ----------------------------------------------------

async function pullReferrers() {
  const since = await referrersHighWatermarkIso();
  const params = { includeDeleted: true };
  if (since) params.updatedAfter = since;

  const res = await apiClient.get('/referrers', { params });
  const rows = Array.isArray(res?.data) ? res.data : [];
  const stats = await withQuotaRetry('referrers', () => applyReferrerDeltas(rows));
  if (stats == null) return { applied: 0, deleted: 0 };

  if (stats.applied || stats.deleted) {
    console.info(`[SYNC] Referrers: +${stats.applied} ~${stats.deleted} (since ${since || 'epoch'})`);
  }
  return stats;
}

// --- Referral commissions delta pull -----------------------------------------

async function pullReferralCommissions({ recentOnly = false } = {}) {
  const since = await commissionsHighWatermarkIso();
  const params = { includeDeleted: true };
  if (since) params.updatedAfter = since;

  if (recentOnly && !since) {
    const cutoff = new Date(Date.now() - RECENT_DAYS_WINDOW * 24 * 3600 * 1000);
    params.startDate = cutoff.toISOString();
  }

  const res = await apiClient.get('/referrers/commissions', { params });
  const rows = Array.isArray(res?.data) ? res.data : [];
  const stats = await withQuotaRetry('commissions', () => applyCommissionDeltas(rows));
  if (stats == null) return { applied: 0, deleted: 0 };

  if (stats.applied || stats.deleted) {
    const tag = recentOnly && !since ? ` [Phase A — last ${RECENT_DAYS_WINDOW}d]` : '';
    console.info(`[SYNC] Commissions${tag}: +${stats.applied} ~${stats.deleted} (since ${since || 'epoch'})`);
  }
  return stats;
}

// --- Reference data snapshots ------------------------------------------------
// Personnel (doctor/staff lists) and the service-price registry are small,
// slow-changing lists. They don't use the delta/high-water model — each pull
// just re-snapshots the whole list (clear + bulkPut). Pulling them on the
// steady tick is what makes a price edit or a newly-added doctor appear on
// every screen automatically, within one cycle, without a manual refresh.

async function pullPersonnel() {
  const res = await apiClient.get('/personnel');
  const rows = Array.isArray(res?.data) ? res.data : [];
  await withQuotaRetry('personnel', () => snapshotPersonnel(rows));
  return { applied: rows.length, deleted: 0 };
}

async function pullServiceCharges() {
  const res = await apiClient.get('/finance/registry');
  const rows = Array.isArray(res?.data) ? res.data : [];
  await withQuotaRetry('service_charges', () => snapshotServiceCharges(rows));
  return { applied: rows.length, deleted: 0 };
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
    case 'EXPENSE_UPDATE':       return { method: 'PUT',    url: `/finance/expenses/${p.id}` };
    case 'EXPENSE_STATUS_UPDATE':return { method: 'PUT',    url: `/finance/expenses/${p.id}/status`,
                                          body: { status: p.status } };
    case 'PAYMENT':              return { method: 'POST',   url: '/finance/payments' };
    case 'REPORT':               return { method: 'POST',   url: '/reporting/save' };
    case 'REPORT_FINALIZE':      return { method: 'POST',   url: '/reporting/report/finalize' };
    case 'REPORT_ADDENDUM':      return { method: 'POST',   url: '/reporting/report/addendum' };
    case 'PRICE_UPDATE':         return { method: 'POST',   url: '/finance/registry' };
    case 'PAYOUT':               return { method: 'POST',   url: '/referrers/commissions' };
    case 'PAYOUT_BATCH':         return { method: 'POST',   url: '/referrers/commissions/batch' };
    case 'PAYOUT_UPDATE':        return { method: 'PUT',    url: `/referrers/commissions/${p.commissionId}` };
    case 'PAYOUT_STATUS_UPDATE': return { method: 'PATCH',  url: `/referrers/commissions/${p.id}/status`,
                                          body: { status: p.status } };
    case 'APPROVAL_CREATE':      return { method: 'POST',   url: '/approvals' };
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
    case 'STUDY_ASSIGN':         return { method: 'POST',   url: `/Study/studies/${p.id}/assign`, body: p.body };
    case 'STUDY_DELETE':         return { method: 'DELETE', url: `/Study/studies/${p.id}` };
    case 'APPOINTMENT_STATUS':   return { method: 'PATCH',  url: `/appointments/${p.id}/status`,
                                          // server expects a raw JSON string for this endpoint
                                          body: JSON.stringify(p.status),
                                          headers: { 'Content-Type': 'application/json' } };
    // Per-service status transition (Technician / Operations multi-service rollout).
    case 'SERVICE_STATUS':       return { method: 'PATCH',  url: `/appointments/${p.appointmentId}/services/${p.serviceId}/status`,
                                          body: { status: p.status } };
    // Per-service technician notes (Operations board).
    case 'SERVICE_NOTES':        return { method: 'PATCH',  url: `/appointments/${p.appointmentId}/services/${p.serviceId}/notes`,
                                          body: { notes: p.notes ?? '' } };
    // Operations board visit notes / comments.
    case 'APPOINTMENT_COMMENT':  return { method: 'POST',   url: `/appointments/${p.appointmentId}/comments`,
                                          body: { body: p.body } };
    case 'APPOINTMENT_COMMENT_BULK': return { method: 'POST', url: '/appointments/comments/bulk',
                                          body: { appointmentIds: p.appointmentIds, body: p.body } };
    case 'PATIENT_CREATE':       return { method: 'POST',   url: '/patients' };
    case 'PATIENT_UPDATE':       return { method: 'PUT',    url: `/patients/${p.patientId}` };
    default: return null;
  }
}

async function sendOutboxItem(item) {
  const route = resolveRoute(item);
  if (!route) throw new Error(`Unknown outbox type: ${item.type}`);
  const body = route.body !== undefined ? route.body : item.payload;
  const config = {
    // Mark this as a sync-engine push so the apiClient error toast
    // pipeline skips it — sync retries are expected to fail
    // intermittently and surface their state via the TopNav
    // pending/poisoned counters, not via toast spam.
    suppressErrorToast: true,
    headers: {
      // Idempotency-Key is the Track 2 prereq — a retried push is a no-op
      // server-side instead of producing a duplicate. The header is harmless
      // on backends that don't implement dedupe yet.
      'Idempotency-Key': item.idempotencyKey,
      'x-sync-engine': '1',
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
      const attempts = (item.attempts || 0) + 1;

      if (!isTransientError(err)) {
        // A data/permission problem a retry can't fix — flag for a human and
        // move on to the next item (this one is individually bad; the rest of
        // the queue may still be perfectly pushable).
        console.error(`[SYNC] Outbox ${item.id} (type=${item.type}) needs attention. Status=${status}. Server: ${errMsg}`);
        await outboxMarkPoisoned(item.id, `${status}: ${errMsg}`);
        stats.poisoned++;
        continue;
      }

      // Transient (offline / server busy / 5xx / timeout). Schedule an
      // automatic retry with capped exponential back-off and STOP this cycle:
      // a later queued item may depend on this one, and the network is
      // evidently unhappy right now, so there's no point pushing further.
      const delay = backoffMs(attempts);
      await outboxMarkFailure(item.id, errMsg, attempts, Date.now() + delay);
      stats.failed++;
      console.warn(`[SYNC] Outbox ${item.id} will retry automatically in ~${Math.round(delay / 1000)}s (attempt ${attempts}).`, err?.message || err);
      break;
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

// Single coordinated pull cycle.
// Steady-state: always uses updatedAfter watermarks for tiny delta scans.
async function runAllPulls() {
  await pullAppointments();
  await pullPatients();
  await pullReports();
  await pullInvoices();
  await pullExpenses();
  await pullReferrers();
  await pullReferralCommissions();
  // Reference data last — lowest priority, tiny payloads.
  try { await pullPersonnel(); }      catch (err) { console.warn('[SYNC] Personnel refresh failed', err?.message || err); }
  try { await pullServiceCharges(); } catch (err) { console.warn('[SYNC] Price registry refresh failed', err?.message || err); }
  await tables.meta().put({ key: 'lastSuccessfulPullAt', value: new Date().toISOString() });
}

// Progressive cold-boot pull.
// Phase A: pull the last RECENT_DAYS_WINDOW days of high-value data so the
//          Revenue Hub renders real data in < 1 second.
// Phase B: 5 seconds later, pull full history silently in the background.
//          liveQuery re-emits; the table fills in without any user action.
async function runProgressivePulls() {
  // Appointments and patients are always pulled fully (they're small + needed for worklist).
  await pullAppointments();
  await pullPatients();
  await pullReports();

  // On boot, purge offline finance data older than 30 days to free up React memory.
  // Historical data is loaded from the backend when users filter older dates.
  try {
    await evictInvoices(RECENT_DAYS_WINDOW);
    await evictExpenses(RECENT_DAYS_WINDOW);
    await evictReferralCommissions(RECENT_DAYS_WINDOW);
  } catch (err) {
    console.warn('[SYNC] Failed to evict old finance data', err);
  }

  // Phase A — finance data for the last 30 days. Fast.
  // Note: We no longer pull full history (Phase B) to prevent browser memory crashes
  // on massive clinics. Historical data is now paginated via server-side APIs in BillingPage.
  await pullInvoices({ recentOnly: true });
  await pullExpenses({ recentOnly: true });
  await pullReferralCommissions({ recentOnly: true });
  await pullReferrers();
  try { await pullPersonnel(); }      catch (err) { console.warn('[SYNC] Personnel refresh failed', err?.message || err); }
  try { await pullServiceCharges(); } catch (err) { console.warn('[SYNC] Price registry refresh failed', err?.message || err); }
  await tables.meta().put({ key: 'lastSuccessfulPullAt', value: new Date().toISOString() });

  console.info('[SYNC] Progressive pulls complete (30-day offline window for finance)');
}

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
    await runAllPulls();
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

// The steady-state heartbeat (every PULL_INTERVAL_MS). Unlike the old
// pull-only tick, this also DRAINS the outbox first — so a change that failed
// transiently retries on its own, automatically, without waiting for the user
// to act or reconnect. pushCycle() respects each item's back-off gate, so a
// down server isn't hammered every 30s. This is the heart of "auto sync".
async function autoSyncTick() {
  if (pulling) return;
  if (!navigator.onLine) return;
  if (!getActiveHospitalId()) return;
  pulling = true;
  const startedAt = Date.now();
  try {
    await pushCycle();
    await runAllPulls();
    logEvent('pull.cycle', { ok: true, ms: Date.now() - startedAt });
  } catch (err) {
    console.warn('[SYNC] Auto-sync tick failed', err?.message || err);
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
    // This path is only reached on an explicit "try now" trigger (boot,
    // reconnect, manual Sync now). Clear any back-off gates so items mid-wait
    // retry immediately — the network is clearly back, no reason to wait out
    // a 5-minute timer.
    await outboxClearBackoff();
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

  // Boot sequence:
  // 1. Measure clock skew.
  // 2. Push any queued mutations from a prior offline session.
  // 3. Progressive pull:
  //    Phase A — last RECENT_DAYS_WINDOW days (fast, user sees data quickly).
  //    Phase B — full history 5 s later (background, silent).
  //
  // The progressive strategy is only used on a cold boot where the cache
  // is empty (no watermark). If the cache already has data (returning
  // user) we run a normal delta pull — it's already fast.
  (async () => {
    await measureClockSkew();
    await pushAndPullCycle();       // flush outbox + targeted pull (appointments/patients/reports)
    await runProgressivePulls();    // progressive boot for finance data
  })();

  // B2 Track 4 — proactive quota monitoring.
  startQuotaMonitor();

  // Steady-state heartbeat: push (auto-retry) AND full delta pull.
  pollTimer = setInterval(autoSyncTick, PULL_INTERVAL_MS);

  // Reconnect: push queued mutations first, then pull.
  const onOnline = () => pushAndPullCycle();
  window.addEventListener('online', onOnline);

  startSyncEngine._cleanup = () => {
    started = false;
    if (pollTimer) clearInterval(pollTimer);
    window.removeEventListener('online', onOnline);
  };

  console.info(`[SYNC] Engine started (progressive boot, interval ${PULL_INTERVAL_MS / 1000}s)`);
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
  // Explicit nudge (e.g. right after enqueue, or a manual retry) → clear any
  // back-off so the just-queued / re-armed item goes out on this very cycle.
  await outboxClearBackoff();
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
    invoicesHighWater:     await invoicesHighWatermarkIso(),
    expensesHighWater:     await expensesHighWatermarkIso(),
    referrersHighWater:    await referrersHighWatermarkIso(),
    commissionsHighWater:  await commissionsHighWatermarkIso(),
  };
}
