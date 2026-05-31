// ════════════════════════════════════════════════════════════════
// src/hooks/useOffline.js
//
// 1Rad / EasyRad Synchronization Manager — Phase B2 Track 1 rewrite.
//
// Pre-B2 this hook owned the outbox (localStorage) AND the push loop
// (performSync). Both responsibilities have moved into the SyncEngine and
// the per-hospital Dexie cache. What's left here is a thin React surface
// over the engine + outbox table:
//   • addToOutbox        → enqueue + nudge push if online
//   • performSync        → deprecated alias for syncNow (kept so existing
//                         callers in AppLayout/BillingPage don't break)
//   • purgePoisonedOutbox→ direct Dexie call
//   • pendingCount / poisonedCount → liveQuery counters
//   • isOnline / isSyncing      → React state derived from network events
//
// The behavioural difference users will notice: on reconnect, the queue
// drains AND the worklist refreshes within ~1s (single coordinator instead
// of two parallel triggers). On the same shared `pulling` mutex, no more
// double-fires.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { enqueue, purgePoisoned, watchCounts } from '../db/repos/outboxRepo';
import { syncNow, syncPushNow } from '../sync/SyncEngine';

export default function useOffline() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [counts, setCounts] = useState({ pending: 0, poisoned: 0 });

  // Network state. SyncEngine has its own listener for the actual sync
  // trigger; we keep one here for the boolean exposed to consumers.
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Reactive outbox counts. liveQuery fires within a few ms of any
  // outbox write, including pushes from SyncEngine itself.
  useEffect(() => {
    const sub = watchCounts().subscribe({
      next: setCounts,
      error: (err) => console.warn('[useOffline] count liveQuery error', err),
    });
    return () => sub.unsubscribe();
  }, []);

  const addToOutbox = useCallback(async (type, payload) => {
    const item = await enqueue(type, payload);
    console.log(`[OFFLINE] Record cached in outbox: ${type}`);
    // If we're online, attempt the push right away — no reason to wait
    // for the next user action. If offline, this is a no-op (the engine's
    // online listener will drain on reconnect).
    if (navigator.onLine) {
      setIsSyncing(true);
      try { await syncPushNow(); } catch (_) {}
      setIsSyncing(false);
    }
    return item.id;
  }, []);

  const purgePoisonedOutbox = useCallback(async () => {
    const purged = await purgePoisoned();
    console.log(`[OFFLINE] Purged ${purged} poisoned record(s).`);
    return purged;
  }, []);

  // Compat shim for the legacy useOffline.performSync(apiClient) signature.
  // The apiClient argument is ignored — the engine knows how to reach the
  // API directly. Callers (AppLayout's auto-sync effect, BillingPage's
  // toolbar) keep working without code changes.
  const performSync = useCallback(async (_apiClient) => {
    setIsSyncing(true);
    try { await syncNow(); } finally { setIsSyncing(false); }
    return { success: 0, failed: 0 }; // legacy shape; counters are now reactive
  }, []);

  return {
    isOnline,
    isSyncing,
    addToOutbox,
    performSync,
    purgePoisonedOutbox,
    pendingCount:  counts.pending,
    poisonedCount: counts.poisoned,
    // syncQueue is no longer surfaced — components that used to read it
    // (none, per grep) would now need to use a separate hook on the
    // outbox table. Removing it intentionally to flush out any stale
    // dependencies at compile time.
  };
}
