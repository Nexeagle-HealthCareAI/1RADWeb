// Storage quota monitor — Phase B2 Track 4.
//
// IndexedDB will throw QuotaExceededError when the user's per-origin
// allowance is full. The exact cap varies (Chrome ~60% of free disk,
// Safari ~1GB). Before B2 we had no detection: a full quota silently
// stopped the SyncEngine from caching new data and nobody noticed until
// the worklist went stale.
//
// What this monitor does:
//   1. Polls navigator.storage.estimate() every 5 min.
//   2. Below 80%: idle — log nothing.
//   3. At 80–94%: emit a 'warn' state. The TopNav badge picks this up
//      via useQuotaStatus and shows "Cache 85%".
//   4. At ≥95%: trigger eviction. evictOlderThan(30) on appointments
//      and reports drops month-old rows. Re-checks immediately; if still
//      ≥95%, evictOlderThan(7) for an aggressive purge.
//
// Why polling vs. event-driven: there's no browser event for "you're
// near quota." Wrapping every bulkPut in a try/catch handles the hard
// failure (Track 4's second half — see safeBulkPut), but proactively
// shedding before we hit the cap keeps the UX smooth.

import { evictOlderThan as evictAppointments } from '../db/repos/appointmentsRepo';
import { evictOlderThan as evictReports }      from '../db/repos/reportsRepo';
import { evictOlderThan as evictInvoices }     from '../db/repos/invoicesRepo';
import { evictOlderThan as evictExpenses }     from '../db/repos/expensesRepo';
import { tables } from '../db/dexie';
import { logEvent } from './syncTelemetry';

const POLL_INTERVAL_MS = 5 * 60_000;          // 5 min
const WARN_THRESHOLD   = 0.80;
const EVICT_THRESHOLD  = 0.95;
const FIRST_EVICT_DAYS = 30;
const HARD_EVICT_DAYS  = 7;

let started = false;
let pollTimer = null;
let lastUsage = null;
let lastQuota = null;
const listeners = new Set();

async function readEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch (err) {
    console.warn('[QUOTA] estimate() failed', err);
    return null;
  }
}

function emit() {
  for (const fn of listeners) {
    try { fn(getQuotaSnapshot()); } catch (_) {}
  }
}

export function onQuotaChange(fn) {
  listeners.add(fn);
  // Fire once on subscribe so the consumer has a baseline.
  try { fn(getQuotaSnapshot()); } catch (_) {}
  return () => listeners.delete(fn);
}

export function getQuotaSnapshot() {
  if (!Number.isFinite(lastUsage) || !Number.isFinite(lastQuota) || lastQuota === 0) {
    return { usage: null, quota: null, ratio: null, state: 'unknown' };
  }
  const ratio = lastUsage / lastQuota;
  let state = 'ok';
  if (ratio >= EVICT_THRESHOLD) state = 'crit';
  else if (ratio >= WARN_THRESHOLD) state = 'warn';
  return { usage: lastUsage, quota: lastQuota, ratio, state };
}

// Drop month-old data first; if still over, drop week-old. Returns the
// post-eviction snapshot so the caller can decide whether to surface a
// "we evicted N records" toast.
export async function evictAggressively() {
  let droppedA = 0;
  let droppedR = 0;
  let droppedI = 0;
  let droppedX = 0;
  try { droppedA += await evictAppointments(FIRST_EVICT_DAYS); } catch (_) {}
  try { droppedR += await evictReports(FIRST_EVICT_DAYS);      } catch (_) {}
  try { droppedI += await evictInvoices(FIRST_EVICT_DAYS);     } catch (_) {}
  try { droppedX += await evictExpenses(FIRST_EVICT_DAYS);     } catch (_) {}
  await refresh();
  if (lastUsage != null && lastQuota != null && lastUsage / lastQuota >= EVICT_THRESHOLD) {
    try { droppedA += await evictAppointments(HARD_EVICT_DAYS); } catch (_) {}
    try { droppedR += await evictReports(HARD_EVICT_DAYS);      } catch (_) {}
    try { droppedI += await evictInvoices(HARD_EVICT_DAYS);     } catch (_) {}
    try { droppedX += await evictExpenses(HARD_EVICT_DAYS);     } catch (_) {}
    await refresh();
  }
  if (droppedA || droppedR || droppedI || droppedX) {
    console.info(`[QUOTA] Evicted ${droppedA} appointment(s) + ${droppedR} report(s) + ${droppedI} invoice(s) + ${droppedX} expense(s) under quota pressure.`);
    try {
      await tables.meta().put({
        key: 'lastEvictionAt',
        value: { at: new Date().toISOString(), appointments: droppedA, reports: droppedR, invoices: droppedI, expenses: droppedX },
      });
    } catch (_) {}
  }
  return { appointments: droppedA, reports: droppedR, invoices: droppedI, expenses: droppedX };
}

async function refresh() {
  const est = await readEstimate();
  if (!est) return;
  lastUsage = est.usage ?? null;
  lastQuota = est.quota ?? null;
  emit();
}

async function tick() {
  await refresh();
  if (lastUsage == null || lastQuota == null) return;
  const ratio = lastUsage / lastQuota;
  if (ratio >= EVICT_THRESHOLD) {
    console.warn(`[QUOTA] Usage ${Math.round(ratio * 100)}% — triggering eviction.`);
    logEvent('quota.crit', { ratio });
    await evictAggressively();
  } else if (ratio >= WARN_THRESHOLD) {
    console.warn(`[QUOTA] Usage ${Math.round(ratio * 100)}% — warning threshold reached.`);
    logEvent('quota.warn', { ratio });
  }
}

export function startQuotaMonitor() {
  if (started) return;
  started = true;
  // Read once immediately so the badge has data on first paint.
  refresh();
  pollTimer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopQuotaMonitor() {
  if (!started) return;
  started = false;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
