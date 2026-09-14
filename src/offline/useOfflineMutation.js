import { useState } from 'react';
import { syncEngine } from './SyncEngine';
import apiClient from '../api/apiClient';

/**
 * A hook that wraps mutation logic.
 * If online, it tries to execute normally (but falls back to offline queue if network fails).
 * If offline, it instantly queues to Dexie and calls onSuccess for optimistic UI.
 */
export function useOfflineMutation() {
  const [isPending, setIsPending] = useState(false);

  const mutate = async ({ url, method = 'POST', payload, headers = {}, onSuccess, onError }) => {
    setIsPending(true);
    
    // Always call onSuccess immediately for optimistic UI
    if (onSuccess) {
      // Simulate a synthetic successful response
      onSuccess({ data: payload, synthetic: true });
    }

    if (!navigator.onLine) {
      // Offline: Add to Dexie outbox
      console.log('[useOfflineMutation] Offline. Queuing to outbox:', { url, method });
      await syncEngine.addToOutbox(url, method, payload, headers);
      setIsPending(false);
      return;
    }

    try {
      // Online: Attempt immediate fetch
      await apiClient({
        method,
        url,
        data: payload,
        headers
      });
      // (onSuccess was already called optimistically)
    } catch (error) {
      // If it failed due to a network error (e.g. 500 or timeout), queue it anyway
      console.warn('[useOfflineMutation] Network request failed. Queuing to outbox as fallback.', error);
      await syncEngine.addToOutbox(url, method, payload, headers);
      if (onError) onError(error);
    } finally {
      setIsPending(false);
    }
  };

  return { mutate, isPending };
}
