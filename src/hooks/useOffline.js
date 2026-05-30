// ════════════════════════════════════════════════════════════════
// src/hooks/useOffline.js
//
// 1Rad / EasyRad Synchronization Manager
// Monitors network connectivity and manages the local 'Outbox'
// to ensure zero data loss during clinical offline sessions.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { nativeStorage } from './useElectron';

const OUTBOX_KEY = '1rad_offline_outbox';

export default function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncQueue, setSyncQueue] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Monitor Connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial load of outbox
    loadOutbox();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 2. Manage Outbox Persistence
  const loadOutbox = async () => {
    const data = await nativeStorage.get(OUTBOX_KEY);
    setSyncQueue(data || []);
  };

  // After this many consecutive POST failures we quarantine an outbox
  // record (mark poisoned) instead of retrying it forever. The user's logs
  // showed one bad record battering /reporting/save with 100+ 404s in a
  // single session — poisoning stops that cold while still preserving the
  // payload for inspection / manual retry.
  const MAX_RETRY_ATTEMPTS = 5;

  const addToOutbox = useCallback(async (type, payload) => {
    const newItem = {
      id: crypto.randomUUID(),
      type, // 'INVOICE', 'EXPENSE', 'PATIENT'
      payload,
      timestamp: new Date().toISOString(),
      attempts: 0,
      poisoned: false,
      lastError: null,
    };

    const updatedQueue = [...syncQueue, newItem];
    setSyncQueue(updatedQueue);
    await nativeStorage.set(OUTBOX_KEY, updatedQueue);

    console.log(`[OFFLINE] Record cached in outbox: ${type}`);
    return newItem.id;
  }, [syncQueue]);

  const clearFromOutbox = useCallback(async (id) => {
    const updatedQueue = syncQueue.filter(item => item.id !== id);
    setSyncQueue(updatedQueue);
    await nativeStorage.set(OUTBOX_KEY, updatedQueue);
  }, [syncQueue]);

  // Mark a record as poisoned after MAX_RETRY_ATTEMPTS failures. It stays in
  // the outbox (so the user / developer can see it) but the sync loop skips
  // it — no more spamming the API with a request we already know will fail.
  const markPoisoned = useCallback(async (id, errorMessage) => {
    const updatedQueue = syncQueue.map(item =>
      item.id === id
        ? { ...item, poisoned: true, lastError: errorMessage || 'Unknown error' }
        : item
    );
    setSyncQueue(updatedQueue);
    await nativeStorage.set(OUTBOX_KEY, updatedQueue);
  }, [syncQueue]);

  // Wipe every poisoned record from the outbox. Surfaced via the return
  // value so a settings page (or the dev console) can call it to clean up.
  const purgePoisonedOutbox = useCallback(async () => {
    const survivors = syncQueue.filter(item => !item.poisoned);
    const purged = syncQueue.length - survivors.length;
    setSyncQueue(survivors);
    await nativeStorage.set(OUTBOX_KEY, survivors);
    console.log(`[OFFLINE] Purged ${purged} poisoned record(s).`);
    return purged;
  }, [syncQueue]);

  // 3. Synchronization Engine
  const performSync = useCallback(async (apiClient) => {
    if (!isOnline || syncQueue.length === 0 || isSyncing) return;

    setIsSyncing(true);
    console.log(`[SYNC] Starting synchronization of ${syncQueue.length} records...`);

    const results = { success: 0, failed: 0 };

    for (const item of syncQueue) {
      // Skip any record we've already poisoned. Without this, every
      // sync cycle (~triggered on online/offline toggles + ~30s intervals)
      // would re-burn through the bad records and re-POST them — the exact
      // symptom in the log: the same record id 404ing dozens of times.
      if (item.poisoned) {
        results.failed++;
        continue;
      }
      try {
        let endpoint = '';
        let method = 'POST';
        
        if (item.type === 'INVOICE') endpoint = '/finance/invoices';
        if (item.type === 'EXPENSE') endpoint = '/finance/expense';
        if (item.type === 'PAYMENT') endpoint = '/finance/payments';
        if (item.type === 'REPORT') endpoint = '/reporting/save';
        if (item.type === 'PRICE_UPDATE') endpoint = '/finance/registry';
        if (item.type === 'PAYOUT') endpoint = '/referrers/commissions';
        if (item.type === 'HOSPITAL_UPDATE') {
           endpoint = `/hospitals/${item.payload.id}`;
           method = 'PUT';
        }
        if (item.type === 'PERSONNEL_CREATE') {
           endpoint = '/personnel';
           method = 'POST';
        }
        if (item.type === 'PERSONNEL_UPDATE') {
           endpoint = `/personnel/${item.payload.id}`;
           method = 'PUT';
        }
        if (item.type === 'PERSONNEL_DELETE') {
           endpoint = `/personnel/${item.payload.id}`;
           method = 'DELETE';
        }
        if (item.type === 'CHAIN_DEPLOY') {
           endpoint = '/hospitals/chain';
           method = 'POST';
        }
        if (item.type === 'PRICE_DELETE') {
           endpoint = `/finance/registry/${item.payload.id}`;
           method = 'DELETE';
        }
        if (item.type === 'EXPENSE_DELETE') {
           endpoint = `/finance/expenses/${item.payload.id}`;
           method = 'DELETE';
        }
        if (item.type === 'INVOICE_DELETE') {
           endpoint = `/finance/invoices/${item.payload.id}`;
           method = 'DELETE';
        }
        if (item.type === 'PRESCRIPTION_UPDATE') {
           endpoint = '/Prescription';
           method = 'POST';
        }
        if (item.type === 'APPOINTMENT_CREATE') {
           endpoint = '/appointments';
           method = 'POST';
        }
        if (item.type === 'APPOINTMENT_STATUS') {
           endpoint = `/appointments/${item.payload.id}/status`;
           method = 'PATCH';
           item.payload = `"${item.payload.status}"`; // Raw string for status endpoint
        }
        if (item.type === 'PATIENT_CREATE') {
           endpoint = '/patients';
           method = 'POST';
        }
        
        if (endpoint) {
          let response;
          if (method === 'POST') response = await apiClient.post(endpoint, item.payload);
          else if (method === 'PUT') response = await apiClient.put(endpoint, item.payload);
          else if (method === 'PATCH') response = await apiClient.patch(endpoint, item.payload, { headers: { 'Content-Type': 'application/json' } });
          else if (method === 'DELETE') response = await apiClient.delete(endpoint);
          
          // ID Resolution for Patient Creation
          if (item.type === 'PATIENT_CREATE' && response?.data?.patientId && item.payload.tempId) {
             const realId = response.data.patientId;
             const tempId = item.payload.tempId;
             console.log(`[SYNC] Resolved ID: ${tempId} -> ${realId}`);
             
             // Update any pending appointments that use this tempId
             const outbox = await nativeStorage.get('1rad_offline_outbox') || [];
             const updatedOutbox = outbox.map(o => {
                if (o.type === 'APPOINTMENT_CREATE' && o.payload.patientId === tempId) {
                   return { ...o, payload: { ...o.payload, patientId: realId } };
                }
                return o;
             });
             await nativeStorage.set('1rad_offline_outbox', updatedOutbox);
          }

          await clearFromOutbox(item.id);
          results.success++;
        } else {
          console.warn(`[SYNC] Unknown record type: ${item.type}`);
          results.failed++;
        }
      } catch (err) {
        const status = err?.response?.status;
        const errMsg = err?.response?.data?.error || err?.message || String(err);
        // 404 = the endpoint or target resource is gone. Retrying will
        // never succeed — poison immediately rather than burning through
        // the retry budget over multiple sync cycles.
        const isPermanent = status === 404;
        const newAttempts = (item.attempts || 0) + 1;
        if (isPermanent || newAttempts >= MAX_RETRY_ATTEMPTS) {
          console.error(
            `[SYNC] Poisoning record ${item.id} (type=${item.type}) after ${newAttempts} attempt(s). ` +
            `Status=${status}. Server said: ${errMsg}`
          );
          await markPoisoned(item.id, `${status}: ${errMsg}`);
        } else {
          // Bump attempts so we converge on the cap and poison eventually
          // even for transient-looking errors that never recover.
          const updated = syncQueue.map(o =>
            o.id === item.id ? { ...o, attempts: newAttempts, lastError: errMsg } : o
          );
          setSyncQueue(updated);
          await nativeStorage.set(OUTBOX_KEY, updated);
          console.warn(`[SYNC] Failed to push record ${item.id} (attempt ${newAttempts}/${MAX_RETRY_ATTEMPTS})`, err);
        }
        results.failed++;
      }
    }

    setIsSyncing(false);
    return results;
  }, [isOnline, syncQueue, isSyncing, clearFromOutbox, markPoisoned]);

  return {
    isOnline,
    syncQueue,
    isSyncing,
    addToOutbox,
    performSync,
    purgePoisonedOutbox,
    pendingCount: syncQueue.filter(i => !i.poisoned).length,
    poisonedCount: syncQueue.filter(i => i.poisoned).length,
  };
}
