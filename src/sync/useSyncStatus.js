// React hook surfacing the offline-cache freshness for header badges.
//
// Two signals composed:
//   1. navigator.onLine (with 'online'/'offline' events) — fast, free,
//      tells us whether the device is reachable at all.
//   2. meta.lastSuccessfulPullAt — the SyncEngine writes this every time
//      a pullCycle completes. liveQuery means the hook re-renders within
//      ~50ms of the engine finishing.
//
// Derived label/tone matrix:
//   online + pull < 60s  → 'ok'    "Live"
//   online + pull < 5m   → 'ok'    "Synced 2m ago"
//   online + pull ≥ 5m   → 'warn'  "Stale 7m"
//   online + no pull yet → 'warn'  "Connecting…"
//   offline + cache      → 'warn'  "Cache 3m"
//   offline + no cache   → 'crit'  "No cache"
//
// The hook drives the existing Sync Hub in TopNav — no new UI surface.
// A future B2 enhancement could click through to a sync-detail modal.

import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { tables } from '../db/dexie';

function relativeShort(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export default function useSyncStatus({ tickMs = 15_000 } = {}) {
  const [online, setOnline]               = useState(() => navigator.onLine);
  const [lastPullAtIso, setLastPullAtIso] = useState(null);
  // Tick state to force re-render so "Synced 2m ago" rolls forward to "3m
  // ago" without anything in Dexie changing. Cheap — once per tickMs.
  const [, setTick]                       = useState(0);

  useEffect(() => {
    const onOn  = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener('online',  onOn);
    window.addEventListener('offline', onOff);
    return () => {
      window.removeEventListener('online',  onOn);
      window.removeEventListener('offline', onOff);
    };
  }, []);

  useEffect(() => {
    const sub = liveQuery(() => tables.meta().get('lastSuccessfulPullAt')).subscribe({
      next: (row) => setLastPullAtIso(row?.value || null),
      error: () => setLastPullAtIso(null),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  const lastPullMs = lastPullAtIso ? new Date(lastPullAtIso).getTime() : null;
  const ageMs      = lastPullMs ? Date.now() - lastPullMs : null;

  let label;
  let tone;
  if (online) {
    if (ageMs == null)          { label = 'Connecting…';                tone = 'warn'; }
    else if (ageMs < 60_000)    { label = 'Live';                       tone = 'ok';   }
    else if (ageMs < 300_000)   { label = `Synced ${relativeShort(ageMs)} ago`;  tone = 'ok';   }
    else                        { label = `Stale ${relativeShort(ageMs)}`;        tone = 'warn'; }
  } else {
    if (ageMs == null)          { label = 'No cache';                   tone = 'crit'; }
    else                        { label = `Cache ${relativeShort(ageMs)}`;       tone = 'warn'; }
  }

  return {
    online,
    lastPullAtIso,
    ageMs,
    label,
    tone,
  };
}
