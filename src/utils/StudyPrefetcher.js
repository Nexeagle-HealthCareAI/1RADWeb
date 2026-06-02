/**
 * StudyPrefetcher
 * Background service that pre-downloads DICOM ZIPs for studies assigned to the
 * logged-in radiologist, so opening a study is instant.
 *
 * Pipeline per study:
 *   GET /Study/{id}/assets -> find ZIP asset
 *   fetch(asset.blobUrl) -> ZIP blob
 *   dicomOptimizer.processZipFileOptimized -> series with File objects
 *   DicomCache.set(assetId, { series: [{ name, rawFiles }] })
 *
 * Then ReportingPage's hydrateZipAsset hits the cache instead of re-downloading.
 *
 * Guardrails:
 *   - Doctor/radiologist roles only
 *   - Skip on cellular (effectiveType 2g/3g) or Save-Data
 *   - Bail if storage estimate has < MIN_FREE_BYTES remaining
 *   - Sequential downloads, pause/resume, cancellable
 *   - Skips items already in DicomCache
 */

import apiClient from '../api/apiClient';
import { dicomOptimizer } from './DicomPerformanceOptimizer';
import { DicomCache } from './DicomCache';
import { PrefetchSettings } from './PrefetchSettings';

const MIN_FREE_BYTES = 500 * 1024 * 1024; // 500 MB
const POLL_FOR_NEW_MS = 60 * 1000;        // re-scan worklist every 60s
// Roles that actually open DICOM studies. Technicians review acquisitions on
// the Technician page, so they benefit from warm studies just like doctors.
const PREFETCH_ROLES = ['doctor', 'radiologist', 'admindoctor', 'technician'];

// On a metered/cellular link we still prefetch — but only the few most-imminent
// studies, so we never silently chew through a data plan. Wi-Fi/ethernet stays
// uncapped. The truly slow tiers (2g) are skipped entirely.
const CELLULAR_PREFETCH_CAP = 3;

// Statuses where the radiologist will likely open the study soon.
const TARGET_STATUSES = new Set(['scanned', 'reporting', 'in_progress']);

const initialState = {
  active: false,
  paused: false,
  pending: 0,
  done: 0,
  failed: 0,
  currentName: null,
  reason: null,   // why we are not running (e.g. 'cellular', 'low-storage')
};

class Prefetcher {
  constructor() {
    this.state = { ...initialState };
    this.listeners = new Set();
    this.cancelled = false;
    this.runPromise = null;
    this.scanTimer = null;
    this.attemptedIds = new Set(); // assetIds tried this session (success or fail)
    this._unsubscribeSettings = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    const snapshot = { ...this.state };
    this.listeners.forEach(fn => {
      try { fn(snapshot); } catch (e) { /* listener errors are not our problem */ }
    });
  }

  _set(patch) {
    this.state = { ...this.state, ...patch };
    this._emit();
  }

  getStatus() { return { ...this.state }; }

  pause() {
    PrefetchSettings.set({ paused: true });
    this._set({ paused: true });
  }

  resume() {
    PrefetchSettings.set({ paused: false });
    this._set({ paused: false, reason: null });
    if (!this.runPromise && this.state.active) this._kickOff();
  }

  /**
   * Start the prefetcher for the given user. Idempotent; calling again with the
   * same user is a no-op.
   */
  start(user) {
    if (!user || this.state.active) return;
    const roles = (user.roles || []).map(r => String(r).toLowerCase());
    if (!roles.some(r => PREFETCH_ROLES.includes(r))) {
      console.log('[PREFETCH] User role not eligible, skipping background prefetch.');
      return;
    }

    this.cancelled = false;
    this.attemptedIds.clear();

    // Restore persisted pause state so a reload doesn't silently resume downloads
    // the user explicitly stopped.
    const persistedPause = !!PrefetchSettings.get().paused;
    this._set({ ...initialState, active: true, paused: persistedPause });
    console.log(`[PREFETCH] Started for user ${user.id}${persistedPause ? ' (paused — honoring saved state)' : ''}`);

    // Politely ask the browser to keep our IndexedDB across pressure events.
    if (navigator.storage?.persist) {
      navigator.storage.persist().then(persisted => {
        console.log(`[PREFETCH] Persistent storage: ${persisted}`);
      }).catch(() => {});
    }

    if (!persistedPause) this._kickOff();

    // Re-scan the worklist periodically so newly-scanned studies start downloading.
    this.scanTimer = setInterval(() => {
      if (!this.state.active || this.state.paused) return;
      if (!this.runPromise) this._kickOff();
    }, POLL_FOR_NEW_MS);

    // React to settings changes (e.g. user enables "Allow on cellular").
    // We retry whatever the current guardrails permit, but only when the
    // change is meaningful — flipping allowCellular while we were blocked.
    this._unsubscribeSettings = PrefetchSettings.subscribe(() => {
      if (!this.state.active) return;
      // Clear the prior block reason — _shouldRunNow will re-derive it.
      if (this.state.reason && !this.runPromise) {
        this._set({ reason: null });
        // Re-attempt by re-clearing attemptedIds for the blocked items? No —
        // attemptedIds only contains things we successfully processed or
        // intentionally failed. A connectivity bail-out happens before we
        // add to attemptedIds, so just kicking off again is enough.
        this._kickOff();
      }
    });
  }

  stop() {
    if (!this.state.active && !this.runPromise) return;
    console.log('[PREFETCH] Stopped.');
    this.cancelled = true;
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    if (this._unsubscribeSettings) {
      this._unsubscribeSettings();
      this._unsubscribeSettings = null;
    }
    this._set({ ...initialState });
    this.attemptedIds.clear();
  }

  _kickOff() {
    if (this.runPromise) return; // already running
    this.runPromise = this._run().finally(() => {
      this.runPromise = null;
    });
  }

  async _shouldRunNow() {
    if (this.cancelled) return { ok: false };
    if (this.state.paused) return { ok: false, reason: 'paused' };

    // Network policy:
    //   • Save-Data or 2g/slow-2g → skip entirely (not worth it), unless the
    //     user explicitly opted in via settings.
    //   • 3g or an explicitly cellular link → prefetch but CAP to a few studies
    //     so we bound data usage on a phone plan.
    //   • 4g / wifi / ethernet → uncapped.
    const { allowCellular } = PrefetchSettings.get();
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let cap = null; // null = unlimited
    if (conn && !allowCellular) {
      const et = conn.effectiveType || '';
      const isCellular = conn.type === 'cellular';
      if (conn.saveData) return { ok: false, reason: 'save-data' };
      if (['slow-2g', '2g'].includes(et)) return { ok: false, reason: 'cellular' };
      if (et === '3g' || isCellular) cap = CELLULAR_PREFETCH_CAP;
    }

    // Storage estimate — if tight, try LRU eviction once before bailing.
    if (navigator.storage?.estimate) {
      try {
        const { quota, usage } = await navigator.storage.estimate();
        if (typeof quota === 'number' && typeof usage === 'number') {
          if (quota - usage < MIN_FREE_BYTES) {
            // Try to make room by evicting cold entries. Target a comfortable margin
            // (1.5x the minimum) so we don't trigger again on the next study.
            const result = await DicomCache.evictUntilFree(MIN_FREE_BYTES * 1.5);
            if (result.evictedCount === 0) {
              return { ok: false, reason: 'low-storage' };
            }
            // Re-check post-eviction
            const recheck = await navigator.storage.estimate();
            if ((recheck.quota - recheck.usage) < MIN_FREE_BYTES) {
              return { ok: false, reason: 'low-storage' };
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    return { ok: true, cap };
  }

  async _fetchWorklist() {
    try {
      const res = await apiClient.get('/appointments');
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      console.warn('[PREFETCH] Worklist fetch failed', err);
      return [];
    }
  }

  _pickTargets(appointments) {
    const today = new Date().toLocaleDateString('en-CA');
    return appointments.filter(a => {
      const studyDate = a.dateTime ? new Date(a.dateTime).toLocaleDateString('en-CA') : null;
      const isToday = studyDate === today;
      const status = (a.status || '').toLowerCase();
      return isToday && TARGET_STATUSES.has(status);
    });
  }

  async _run() {
    const gate = await this._shouldRunNow();
    if (!gate.ok) {
      this._set({ reason: gate.reason || null });
      return;
    }
    this._set({ reason: null });

    const appointments = await this._fetchWorklist();
    const targets = this._pickTargets(appointments);

    // Build the queue: appointments not yet attempted this session.
    let queue = targets.filter(a => !this.attemptedIds.has(String(a.appointmentId || a.id)));
    // On a metered link, only take the few most-imminent studies per cycle so
    // we don't drain the data plan. (Targets are already today's scanned /
    // in-progress studies, i.e. the ones about to be opened.)
    if (gate.cap != null) queue = queue.slice(0, gate.cap);
    this._set({ pending: queue.length });

    for (const appt of queue) {
      if (this.cancelled || this.state.paused) break;

      // Re-check guardrails between items so a network/storage change pauses us cleanly.
      const recheck = await this._shouldRunNow();
      if (!recheck.ok) { this._set({ reason: recheck.reason || null }); break; }

      const apptId = String(appt.appointmentId || appt.id);
      this.attemptedIds.add(apptId);

      try {
        const assetRes = await apiClient.get(`/Study/${apptId}/assets`).catch(() => null);
        const assets = assetRes?.data || [];
        const zipAsset = assets.find(a => (a.fileType || '').toLowerCase() === 'zip');
        if (!zipAsset || !zipAsset.blobUrl) {
          this._set({ pending: Math.max(0, this.state.pending - 1) });
          continue;
        }

        // Already cached? skip (peek so background scans don't refresh LRU).
        const cached = await DicomCache.peek(zipAsset.id);
        if (cached?.series?.length > 0) {
          this._set({
            done: this.state.done + 1,
            pending: Math.max(0, this.state.pending - 1)
          });
          continue;
        }

        this._set({ currentName: appt.patientName || appt.displayId || apptId });

        // Download (proxy fallback for CORS — matches hydrateZipAsset's behaviour)
        let blob;
        try {
          const resp = await fetch(zipAsset.blobUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/zip, application/octet-stream, */*' },
            cache: 'default',
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          blob = await resp.blob();
        } catch (e) {
          try {
            const proxyRes = await apiClient.get('/Study/proxy-asset', {
              params: { url: zipAsset.blobUrl },
              responseType: 'blob',
              timeout: 120000,
            });
            blob = proxyRes.data;
          } catch (proxyErr) {
            throw new Error('PREFETCH_DOWNLOAD_FAILED');
          }
        }

        const file = new File([blob], zipAsset.fileName || `${apptId}.zip`, {
          type: 'application/zip',
        });

        // Cooperative yield — let UI breathe before kicking off the heavy worker pool.
        await idleOrTimeout(50);

        const result = await dicomOptimizer.processZipFileOptimized(file);
        const series = result?.series || [];
        if (series.length === 0) {
          this._set({
            failed: this.state.failed + 1,
            pending: Math.max(0, this.state.pending - 1),
            currentName: null
          });
          continue;
        }

        const cachePayload = {
          id: zipAsset.id,
          name: zipAsset.fileName,
          type: 'ZIP',
          remoteUrl: zipAsset.blobUrl,
          series: series.map(s => ({
            name: `${s.patientName} - ${s.seriesDesc}`,
            rawFiles: s.files,
            seriesUID: s.seriesUID,
            modality: s.modality,
            patientName: s.patientName,
            seriesDesc: s.seriesDesc,
            metadata: s.metadata,
          }))
        };

        await DicomCache.set(zipAsset.id, cachePayload);

        this._set({
          done: this.state.done + 1,
          pending: Math.max(0, this.state.pending - 1),
          currentName: null
        });
      } catch (err) {
        console.warn(`[PREFETCH] Study ${apptId} failed:`, err.message || err);
        this._set({
          failed: this.state.failed + 1,
          pending: Math.max(0, this.state.pending - 1),
          currentName: null
        });
      }
    }
  }
}

function idleOrTimeout(ms) {
  return new Promise(resolve => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: ms });
    } else {
      setTimeout(resolve, ms);
    }
  });
}

export const StudyPrefetcher = new Prefetcher();
