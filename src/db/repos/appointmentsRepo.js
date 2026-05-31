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
  if (live.length)       await t.bulkPut(live);
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
  return new Date(max._updatedAtMs).toISOString();
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
export function watchAppointments({ dateIso, status = 'ALL' } = {}) {
  return liveQuery(async () => {
    const t = tables.appointments();
    let arr = await t.toArray();

    // Filter by appointment day (Asia/Kolkata) — the server-side filter
    // happens during sync; this is just the rendered view filter.
    if (dateIso) {
      arr = arr.filter(a => {
        if (!a.dateTime) return false;
        const d = new Date(a.dateTime);
        // toLocaleDateString('en-CA') gives YYYY-MM-DD in local timezone.
        return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === dateIso;
      });
    }
    if (status && status !== 'ALL') {
      arr = arr.filter(a => (a.status || '').toUpperCase() === status.toUpperCase());
    }

    // Assign per-day token numbers from the appointment's own
    // dailyTokenNumber when present, falling back to chronological
    // counting for legacy records (mirrors what AppointmentBoard
    // used to do post-fetch).
    const chronological = [...arr].sort(
      (a, b) => new Date(a.dateTime || 0).getTime() - new Date(b.dateTime || 0).getTime()
    );
    const dailyCounters = {};
    const withTokens = chronological.map(item => {
      const dateKey = item.dateTime ? item.dateTime.split('T')[0] : dateIso || 'unknown';
      dailyCounters[dateKey] = (dailyCounters[dateKey] || 0) + 1;
      return {
        ...item,
        tokenNo: item.dailyTokenNumber ?? dailyCounters[dateKey],
      };
    });

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

// One-shot read by id. Used by single-record views (not the worklist).
export async function getAppointmentById(appointmentId) {
  if (!appointmentId) return null;
  return tables.appointments().get(appointmentId);
}
