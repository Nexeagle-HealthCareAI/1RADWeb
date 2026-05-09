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

  const addToOutbox = useCallback(async (type, payload) => {
    const newItem = {
      id: crypto.randomUUID(),
      type, // 'INVOICE', 'EXPENSE', 'PATIENT'
      payload,
      timestamp: new Date().toISOString()
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

  // 3. Synchronization Engine
  const performSync = useCallback(async (apiClient) => {
    if (!isOnline || syncQueue.length === 0 || isSyncing) return;

    setIsSyncing(true);
    console.log(`[SYNC] Starting synchronization of ${syncQueue.length} records...`);

    const results = { success: 0, failed: 0 };

    for (const item of syncQueue) {
      try {
        let endpoint = '';
        if (item.type === 'INVOICE') endpoint = '/finance/invoices';
        if (item.type === 'EXPENSE') endpoint = '/finance/expense';
        if (item.type === 'PAYMENT') endpoint = '/finance/payments';
        if (item.type === 'REPORT') endpoint = '/reporting/save';
        
        if (endpoint) {
          await apiClient.post(endpoint, item.payload);
          await clearFromOutbox(item.id);
          results.success++;
        } else {
          console.warn(`[SYNC] Unknown record type: ${item.type}`);
          results.failed++;
        }
      } catch (err) {
        console.error(`[SYNC] Failed to push record ${item.id}`, err);
        results.failed++;
      }
    }

    setIsSyncing(false);
    return results;
  }, [isOnline, syncQueue, isSyncing, clearFromOutbox]);

  return {
    isOnline,
    syncQueue,
    isSyncing,
    addToOutbox,
    performSync,
    pendingCount: syncQueue.length
  };
}
