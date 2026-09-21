// useLiveAppointments — the worklist reader for every appointment board.
//
// Appointments are read straight from the live backend. There is NO IndexedDB
// cache and NO offline outbox behind this hook: it holds the current window's
// rows in React memory only (gone on reload), keeps them fresh by polling for
// changes, and surfaces a failed request as `error` instead of queueing it.
//
// It replaces the old `watchAppointments` Dexie liveQuery with the same five
// "modes" so each board keeps its exact semantics:
//
//   mode: 'today'   — dateIso required; that IST day only.
//   mode: 'future'  — strictly AFTER today.
//   mode: 'past'    — strictly BEFORE today; optional startIso/endIso, else the
//                     last DEFAULT_PAST_WINDOW_DAYS days.
//   mode: 'all'     — last ALL_MODE_RECENT_DAYS days PLUS any older visit not
//                     yet CANCELLED/DELIVERED (the clinical worklists).
//
// Load strategy:
//   1. Window load — cursor-paged GET /appointments for the window. Rows show
//      up page by page (`loading` clears after the first page).
//   2. Delta polling — every `pollMs`, GET with `updatedAfter` (+ tombstones)
//      and merge just what changed. The server also reports visits whose
//      per-service lines changed, since those don't bump the parent's own
//      UpdatedAt.
//   3. A full window reload every FULL_RELOAD_MS reconciles anything a delta
//      can't express (e.g. a visit that aged out of an 'all' window).
//
// Returned `rows` is referentially stable until something actually changed, so
// boards can use it directly in useMemo/useEffect dependencies.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../api/apiClient';

const PAGE_SIZE = 500;
const MAX_ROWS = 20000;               // safety valve against a runaway window
const DEFAULT_POLL_MS = 30_000;
const FULL_RELOAD_MS = 10 * 60_000;
const WATERMARK_OVERLAP_MS = 2_000;   // re-read a couple of seconds so a commit that lands late is never skipped
const DEFAULT_PAST_WINDOW_DAYS = 90;
const ALL_MODE_RECENT_DAYS = 60;
const FINALIZED_STATUSES = new Set(['CANCELLED', 'DELIVERED']);
const PRIORITY_RANK = { STAT: 0, URGENT: 1, ROUTINE: 2 };

// ── IST day helpers (India has no DST, so "next day" is exactly +24h) ───────
const ymdKolkata = (input) => {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};
const addDaysYmd = (ymd, days) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const istDayStartMs = (ymd) => new Date(`${ymd}T00:00:00+05:30`).getTime();
// Server timestamps arrive without a zone designator; they are UTC instants.
const toMs = (iso) => {
  if (!iso) return 0;
  const s = String(iso);
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
  const t = new Date(hasTz ? s : `${s}Z`).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// Server query params for a mode + the matching client-side membership test
// (kept so rows merged in from elsewhere, or that age out between full
// reloads, are filtered exactly the way the server would have).
function buildWindow({ mode, dateIso, startIso, endIso }) {
  const today = ymdKolkata(new Date());
  const yesterday = addDaysYmd(today, -1);

  if (mode === 'today') {
    if (!dateIso) return null;
    const lo = istDayStartMs(dateIso);
    const hi = lo + 86_400_000;
    return {
      params: { startDate: dateIso, endDate: dateIso },
      includes: (r) => { const t = toMs(r.dateTime); return t >= lo && t < hi; },
    };
  }
  if (mode === 'future') {
    const tomorrow = addDaysYmd(today, 1);
    const lo = istDayStartMs(tomorrow);
    return {
      params: { startDate: tomorrow },
      includes: (r) => toMs(r.dateTime) >= lo,
    };
  }
  if (mode === 'past') {
    const startYmd = startIso || addDaysYmd(today, -DEFAULT_PAST_WINDOW_DAYS);
    const endYmd = endIso || yesterday;
    const lo = istDayStartMs(startYmd);
    const hi = istDayStartMs(endYmd) + 86_400_000;
    return {
      params: { startDate: startYmd, endDate: endYmd },
      includes: (r) => { const t = toMs(r.dateTime); return t >= lo && t < hi; },
    };
  }
  // 'all'
  const recentFromYmd = addDaysYmd(today, -ALL_MODE_RECENT_DAYS);
  const recentFrom = istDayStartMs(recentFromYmd);
  return {
    params: { activeSince: recentFromYmd },
    includes: (r) => toMs(r.dateTime) >= recentFrom
      || !FINALIZED_STATUSES.has(String(r.status || '').toUpperCase()),
  };
}

// What makes two versions of a row "different enough to re-render".
const rowSignature = (r) => [
  r.updatedAt, r.status, r.delayReason, r.dailyTokenNumber, r.assetCount, r.priority,
  (r.services || []).map(s => `${s.id}:${s.status}:${s.updatedAt}:${s.technicianComments || ''}`).join(','),
].join('|');

const normalize = (dto) => ({ ...dto, _updatedAtMs: toMs(dto.updatedAt) });

// Highest UpdatedAt seen, INCLUDING service lines (a service edit doesn't move
// the parent's UpdatedAt, so the watermark must follow it or the same service
// change would be re-returned on every poll).
const rowWatermark = (dto) => {
  let m = toMs(dto.updatedAt);
  for (const s of dto.services || []) { const t = toMs(s.updatedAt); if (t > m) m = t; }
  return m;
};

const unwrapItems = (data) => (Array.isArray(data) ? data : (data?.items || []));

export default function useLiveAppointments({
  mode = 'today',
  dateIso,
  startIso,
  endIso,
  status = 'ALL',
  pollMs = DEFAULT_POLL_MS,
  enabled = true,
} = {}) {
  const win = useMemo(
    () => (enabled ? buildWindow({ mode, dateIso, startIso, endIso }) : null),
    [enabled, mode, dateIso, startIso, endIso],
  );
  const windowKey = win ? JSON.stringify(win.params) + '|' + mode : 'none';

  const mapRef = useRef(new Map());
  const winRef = useRef(win);
  winRef.current = win;
  const watermarkRef = useRef(0);
  const lastFullLoadRef = useRef(0);
  const seqRef = useRef(0);
  const inFlightRef = useRef(false);

  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);
  const [loading, setLoading] = useState(!!win);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  // Merge server rows into the in-memory map. Returns whether anything changed.
  const mergeDtos = useCallback((dtos, { fromDelta = false } = {}) => {
    let changed = false;
    const map = mapRef.current;
    for (const dto of dtos) {
      if (!dto?.appointmentId) continue;
      if (fromDelta && dto.deletedAt) {
        if (map.delete(dto.appointmentId)) changed = true;
        continue;
      }
      if (dto.deletedAt) continue;
      const next = normalize(dto);
      const prev = map.get(dto.appointmentId);
      // Merge onto what's there: a full single-record fetch carries detail
      // fields (address, notes, ...) a worklist row doesn't — keep them.
      const merged = prev ? { ...prev, ...next } : next;
      if (!prev || rowSignature(prev) !== rowSignature(merged)) changed = true;
      map.set(dto.appointmentId, merged);
      const wm = rowWatermark(dto);
      if (wm > watermarkRef.current) watermarkRef.current = wm;
    }
    return changed;
  }, []);

  // ── Full window load (cursor-paged, progressive) ──────────────────────────
  const loadWindow = useCallback(async ({ silent = false } = {}) => {
    const w = winRef.current;
    if (!w) return;
    const seq = ++seqRef.current;
    if (!silent) { setLoading(true); setLoadingMore(false); }
    try {
      const fresh = new Map();
      let cursor = null;
      let maxWm = 0;
      let first = true;
      let count = 0;
      do {
        const res = await apiClient.get('/appointments', {
          params: { ...w.params, pageSize: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
          suppressErrorToast: true,
        });
        if (seq !== seqRef.current) return; // window changed / newer load started
        const items = unwrapItems(res.data);
        for (const dto of items) {
          if (!dto?.appointmentId || dto.deletedAt) continue;
          const wm = rowWatermark(dto);
          if (wm > maxWm) maxWm = wm;
          const prev = mapRef.current.get(dto.appointmentId);
          const next = normalize(dto);
          fresh.set(dto.appointmentId, prev ? { ...prev, ...next } : next);
        }
        count += items.length;
        cursor = Array.isArray(res.data) ? null : (res.data?.nextCursor || null);
        // Publish after every page so the board fills in progressively. A
        // reload swaps the whole map (rows that left the window drop out).
        mapRef.current = new Map(fresh);
        watermarkRef.current = Math.max(maxWm, 0);
        bump();
        if (first) { first = false; setLoading(false); if (cursor) setLoadingMore(true); }
        if (count >= MAX_ROWS) {
          console.warn(`[appointments] window truncated at ${MAX_ROWS} rows`);
          cursor = null;
        }
      } while (cursor);
      if (seq !== seqRef.current) return;
      lastFullLoadRef.current = Date.now();
      setLoadingMore(false);
      setLoading(false);
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      if (seq !== seqRef.current) return;
      console.warn('[appointments] window load failed', err?.message || err);
      setLoading(false);
      setLoadingMore(false);
      setError(err);
    }
  }, [bump]);

  // ── Delta poll ────────────────────────────────────────────────────────────
  const pollDelta = useCallback(async () => {
    const w = winRef.current;
    if (!w) return;
    // Nothing loaded yet (empty window) → there's no watermark to poll from;
    // an empty window is cheap to just reload.
    if (!watermarkRef.current) { await loadWindow({ silent: true }); return; }
    const seq = seqRef.current;
    try {
      const since = new Date(watermarkRef.current - WATERMARK_OVERLAP_MS).toISOString();
      const res = await apiClient.get('/appointments', {
        params: { ...w.params, updatedAfter: since, includeDeleted: true },
        suppressErrorToast: true,
      });
      if (seq !== seqRef.current) return;
      if (mergeDtos(unwrapItems(res.data), { fromDelta: true })) bump();
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      if (seq !== seqRef.current) return;
      console.warn('[appointments] poll failed', err?.message || err);
      setError(err);
    }
  }, [bump, loadWindow, mergeDtos]);

  const tick = useCallback(async () => {
    if (inFlightRef.current || !winRef.current) return;
    inFlightRef.current = true;
    try {
      if (Date.now() - lastFullLoadRef.current > FULL_RELOAD_MS) await loadWindow({ silent: true });
      else await pollDelta();
    } finally {
      inFlightRef.current = false;
    }
  }, [loadWindow, pollDelta]);

  // Reset + load whenever the window (mode/date/range) changes.
  useEffect(() => {
    mapRef.current = new Map();
    watermarkRef.current = 0;
    lastFullLoadRef.current = 0;
    seqRef.current++;
    bump();
    setError(null);
    if (!winRef.current) { setLoading(false); setLoadingMore(false); return undefined; }
    inFlightRef.current = true;
    loadWindow().finally(() => { inFlightRef.current = false; });
    return () => { seqRef.current++; };
  }, [windowKey, loadWindow, bump]);

  // Steady-state polling — paused while the tab is hidden, and refreshed the
  // moment it becomes visible / the connection returns.
  useEffect(() => {
    if (!win || !pollMs) return undefined;
    const id = setInterval(() => { if (!document.hidden) tick(); }, pollMs);
    const onVisible = () => { if (!document.hidden) tick(); };
    const onOnline = () => tick();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [win, pollMs, tick]);

  // ── Derived, sorted rows (same order the old repo produced) ───────────────
  const rows = useMemo(() => {
    if (!win) return [];
    const wantStatus = status && status !== 'ALL' ? String(status).toUpperCase() : null;
    const out = [];
    for (const r of mapRef.current.values()) {
      if (!win.includes(r)) continue;
      if (wantStatus && String(r.status || '').toUpperCase() !== wantStatus) continue;
      out.push({ ...r, tokenNo: r.dailyTokenNumber ?? null });
    }
    out.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 2;
      const pb = PRIORITY_RANK[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      const tA = a.tokenNo || 0;
      const tB = b.tokenNo || 0;
      if (tA !== tB) return tB - tA;
      return toMs(b.dateTime) - toMs(a.dateTime);
    });
    return out;
    // `version` is the change signal for the ref-held map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, win, status]);

  // ── Imperative helpers for the boards ─────────────────────────────────────
  // Immediate refresh (after a mutation): pull whatever changed.
  const refresh = useCallback(() => tick(), [tick]);
  // Hard reload of the whole window.
  const reload = useCallback(() => loadWindow({ silent: true }), [loadWindow]);
  // In-memory only patch for instant UI feedback; the next poll/refresh is
  // authoritative. Callers should refresh() (or reload() on failure).
  const patchRow = useCallback((appointmentId, mutate) => {
    const prev = mapRef.current.get(appointmentId);
    if (!prev) return;
    const next = mutate({ ...prev });
    if (!next) return;
    mapRef.current.set(appointmentId, next);
    bump();
  }, [bump]);
  // Merge full single-record fetches (detail fields) or a fresh booking.
  const mergeRows = useCallback((dtos) => {
    if (mergeDtos(Array.isArray(dtos) ? dtos : [dtos])) bump();
  }, [bump, mergeDtos]);

  return { rows, loading, loadingMore, error, lastUpdatedAt, refresh, reload, patchRow, mergeRows };
}
