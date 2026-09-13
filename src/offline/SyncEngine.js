import { db } from './db';
import apiClient from '../api/apiClient';

class SyncEngine {
  constructor() {
    this.isSyncing = false;
    
    // Listen for online events to automatically flush the outbox
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flushOutbox());
    }
  }

  async flushOutbox() {
    if (this.isSyncing || !navigator.onLine) return;
    this.isSyncing = true;

    try {
      const pendingMutations = await db.outbox.orderBy('id').toArray();
      if (pendingMutations.length === 0) {
        this.isSyncing = false;
        return;
      }

      console.log(`[SyncEngine] Found ${pendingMutations.length} pending mutations, syncing...`);

      for (const mutation of pendingMutations) {
        try {
          console.log(`[SyncEngine] Executing: ${mutation.method} ${mutation.url}`);
          // Execute the API call
          await apiClient({
            method: mutation.method,
            url: mutation.url,
            data: mutation.payload,
            headers: mutation.headers
          });

          // Delete from Dexie on success
          await db.outbox.delete(mutation.id);
        } catch (error) {
          console.error(`[SyncEngine] Failed to execute ${mutation.method} ${mutation.url}:`, error);
          // If the error is a 4xx (client error), we might want to drop it to prevent poison messages.
          // For now, we'll keep it simple: stop syncing and try again later if it fails.
          break;
        }
      }
    } catch (error) {
      console.error('[SyncEngine] Error reading from outbox:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  async addToOutbox(url, method, payload, headers) {
    const mutation = {
      url,
      method,
      payload,
      headers,
      timestamp: Date.now()
    };
    
    await db.outbox.add(mutation);
    
    // Attempt immediate flush in case we are online
    this.flushOutbox();
  }
}

export const syncEngine = new SyncEngine();
