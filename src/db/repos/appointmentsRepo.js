// Read API for appointments — pages call this instead of apiClient.get.
//
// Why the repo layer:
//   • Pages don't need to know whether the data came from network or cache;
//     they just declare what they want and the repo decides.
//   • Centralised place to apply consistent filters (e.g., hide deleted
//     rows) and shape mapping (server camelCase → local store).
//   • Centralised place to add memoisation / suspense / etc. later
//     without rewriting components.
//
// liveQuery semantics:
//   • The hook below returns a Dexie liveQuery — a Promise-like that
//     RE-FIRES whenever the underlying tables change. When SyncEngine
//     writes a delta from the cloud, every component using the same
//     liveQuery handle re-renders automatically.

import { liveQuery } from 'dexie';
import { tables } from '../dexie';
import { insertOptimisticInvoice } from './invoicesRepo';
import { insertOptimisticCommission } from './referralCommissionsRepo';

// Map the server's AppointmentDto (camelCase JSON over the wire) into the
// local row shape. We keep the same field names so component code that
// used to read `app.patientName` etc. doesn't change — only the SOURCE
// of the data changes. We also stash a numeric mirror of UpdatedAt so
// Dexie's range queries on _updatedAtMs are clean.
export function fromServerDto(dto) {
  if (!dto || !dto.appointmentId) return null;
  const updatedAtIso = dto.updatedAt || null;
  return {
    ...dto,
    _updatedAtMs: updatedAtIso ? new Date(updatedAtIso).getTime() : 0,
    _localDirty: 0, // synced from server — clean by definition
  };
}

// Bulk-upsert a page of server rows. Tombstones (DeletedAt != null) are
// deleted locally so the worklist matches the server's view immediately.
//
// This pull hits the WORKLIST endpoint, which returns the lean
// AppointmentSummaryDto — it doesn't carry detail-only fields (Notes,
// Village/Block/District/Address, SourceOfInfo, referrer specialty/degree,
// SupportedByDoctor, Services, ...). Those fields only ever arrive via the
// booking form's optimistic insert or a full single-record fetch. So we
// MERGE each incoming row onto whatever's already cached instead of
// replacing it outright — otherwise the very next worklist sync (this runs
// after every appointment mutation, including "mark arrived", plus every
// 30s) blows away detail fields the summary DTO never carries, and the
// edit drawer — which reads straight from this cache with no fresh
// fetch — shows them blank.
export async function applyServerDeltas(serverDtos) {
  const t = tables.appointments();
  const tombstones = [];
  const live       = [];
  for (const dto of serverDtos || []) {
    if (dto.deletedAt) tombstones.push(dto.appointmentId);
    else {
      const row = fromServerDto(dto);
      if (row) live.push(row);
    }
  }
  if (tombstones.length) await t.bulkDelete(tombstones);
  if (live.length) {
    const existing = await t.bulkGet(live.map(r => r.appointmentId));
    const merged = live.map((row, i) => existing[i] ? { ...existing[i], ...row } : row);
    await t.bulkPut(merged);
  }
  return { applied: live.length, deleted: tombstones.length };
}

// "What's the latest UpdatedAt I've seen so far?" — sent to the server as
// ?updatedAfter= so the next pull is a delta, not a full refetch. We use
// Math.max across all local rows so we're resilient to out-of-order writes
// (the watermark only ever moves forward).
export async function highWatermarkIso() {
  const t = tables.appointments();
  const max = await t.orderBy('_updatedAtMs').reverse().limit(1).first();
  if (!max || !max._updatedAtMs) return null;
  // +1ms: the server stamps UpdatedAt at sub-millisecond precision, but JS Date
  // truncates to ms — so sending the raw max re-pulls the boundary rows forever
  // (server's UpdatedAt > our truncated value). Advance past them.
  return new Date(max._updatedAtMs + 1).toISOString();
}

// liveQuery-backed reader. Mirrors the shape of the existing AppointmentBoard
// fetch: it returns the rows already merged with the daily token counter
// + sorted by priority then token desc, so the existing render code can
// be lifted verbatim.
//
// React hook usage:
//   const rows = useLiveAppointments({ dateIso });
//   if (rows == null) return <Loading/>;
//
// Day-of-month string in Asia/Kolkata for a given Date or ISO. Used to
// compare appointment dates without timezone gotchas.
function ymdKolkata(input) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Watch the appointments cache in one of three "tab modes":
//
//   mode: 'today'   — dateIso required; returns only that day's appointments.
//   mode: 'future'  — returns appointments strictly AFTER today.
//   mode: 'past'    — returns appointments strictly BEFORE today, optionally
//                     bounded by startIso / endIso (inclusive).
//
// The sync engine pulls every appointment delta the user has access to (no
// date filter), so all three modes are served from the same cached table.
// The mode just controls which slice is rendered. status='ALL' disables the
// status filter; otherwise it's case-insensitive on the appointment status.
export function watchAppointments({
  mode = 'today',
  dateIso,
  startIso,
  endIso,
  status = 'ALL',
} = {}) {
  return liveQuery(async () => {
    const t = tables.appointments();
    let arr = await t.toArray();
    const todayIso = ymdKolkata(new Date());

    if (mode === 'today') {
      if (!dateIso) return [];
      arr = arr.filter(a => a.dateTime && ymdKolkata(a.dateTime) === dateIso);
    } else if (mode === 'future') {
      arr = arr.filter(a => a.dateTime && ymdKolkata(a.dateTime) > todayIso);
    } else if (mode === 'past') {
      arr = arr.filter(a => {
        if (!a.dateTime) return false;
        const d = ymdKolkata(a.dateTime);
        if (!d || d >= todayIso) return false;          // strictly past
        if (startIso && d < startIso) return false;     // optional lower bound
        if (endIso   && d > endIso)   return false;     // optional upper bound
        return true;
      });
    }
    if (status && status !== 'ALL') {
      arr = arr.filter(a => (a.status || '').toUpperCase() === status.toUpperCase());
    }

    // Token number now reflects ARRIVAL order — the server assigns it when the
    // patient is marked arrived, not at booking. So we surface the server's
    // dailyTokenNumber as-is and leave it null until arrival (the UI renders a
    // dash). We deliberately do NOT fabricate a sequential number anymore, which
    // would have shown a fake token for patients who haven't arrived yet.
    const withTokens = arr.map(item => ({
      ...item,
      tokenNo: item.dailyTokenNumber ?? null,
    }));

    // Render order: STAT → URGENT → ROUTINE, then token DESC, then time DESC.
    // (Same policy the AppointmentBoard already applies after fetch.)
    const PRIORITY_RANK = { STAT: 0, URGENT: 1, ROUTINE: 2 };
    withTokens.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 2;
      const pb = PRIORITY_RANK[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      const tA = a.tokenNo || 0;
      const tB = b.tokenNo || 0;
      if (tA !== tB) return tB - tA;
      const dA = new Date(a.dateTime || 0).getTime();
      const dB = new Date(b.dateTime || 0).getTime();
      return dB - dA;
    });

    return withTokens;
  });
}

// Eviction — drop appointments whose own dateTime is older than the cut-off.
// We use dateTime (the appointment slot) rather than _updatedAtMs because
// an old appointment getting a comment update shouldn't keep it alive
// indefinitely: the cache only needs to retain rows the radiologist might
// actually open. Returns the number of rows dropped.
//
// Called by the quota monitor (B2 Track 4) when local storage is filling.
// Safe to run any time — the SyncEngine will re-pull anything the user
// actually queries against the next ?updatedAfter=.
export async function evictOlderThan(daysAgo) {
  if (!Number.isFinite(daysAgo) || daysAgo <= 0) return 0;
  const cutoffIso = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
  const t = tables.appointments();
  return t
    .filter(a => (a.dateTime || '') < cutoffIso)
    .delete();
}

// One-shot read by id. Used by single-record views (not the worklist).
export async function getAppointmentById(appointmentId) {
  if (!appointmentId) return null;
  return tables.appointments().get(appointmentId);
}

// Optimistic local patch. Lets a board apply a status/comment change to the
// cached appointment row IMMEDIATELY — so the liveQuery-driven worklist
// reflects the change instantly, including while OFFLINE (where there's no
// pull to bring the server's version back). The matching outbox mutation
// carries the real write; on reconnect it pushes, then the next pull reconciles
// this row with the canonical server copy.
//
//   mutate(row) → patched row (or falsy to skip).
//
// We deliberately DO NOT advance _updatedAtMs: the high-water cursor must stay
// put so the server's reconciling delta isn't skipped on the next pull.
export async function patchCachedAppointment(appointmentId, mutate) {
  if (!appointmentId || typeof mutate !== 'function') return false;
  const t = tables.appointments();
  const row = await t.get(appointmentId);
  if (!row) return false;
  const patched = mutate({ ...row });
  if (!patched) return false;
  patched._localDirty = 1;            // marks an unsynced optimistic change
  patched._updatedAtMs = row._updatedAtMs; // keep the delta cursor unchanged
  
  if (patched.status === 'confirmed' && row.status !== 'confirmed') {
    insertOptimisticInvoice(patched).catch(err => console.warn('[OPS] Optimistic invoice failed', err));
    insertOptimisticCommission(patched).catch(err => console.warn('[OPS] Optimistic commission failed', err));
  }

  await t.put(patched);
  return true;
}

// Optimistic local INSERT for a just-booked appointment, so the worklist shows
// it INSTANTLY (via liveQuery) instead of waiting for the next delta pull to
// bring it back. The server already created it (we pass its real id); the next
// pull then reconciles this partial row with the canonical copy (token,
// displayId, etc.). _updatedAtMs stays 0 so the high-water cursor doesn't move
// past the server's reconciling delta. If a pull already landed the row first,
// we leave that canonical copy untouched.
export async function insertCachedAppointment(row) {
  if (!row || !row.appointmentId) return false;
  const t = tables.appointments();
  const existing = await t.get(row.appointmentId);
  if (existing) return false;
  await t.put({ ...row, _updatedAtMs: 0, _localDirty: 1 });
  return true;
}
