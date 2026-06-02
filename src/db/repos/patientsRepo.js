// Read/write API for the cached Patients table.
//
// Pattern mirrors appointmentsRepo:
//   • fromServerDto maps server DTO → local row, normalising case-insensitive
//     search fields up-front so Dexie's index can serve "starts-with" queries
//     without a JS-side scan.
//   • applyServerDeltas bulkPut for live rows, bulkDelete for tombstones.
//   • highWatermarkIso returns the latest UpdatedAt the local DB has seen,
//     to be sent back as ?updatedAfter= on the next pull.
//   • watchPatients is the liveQuery the booking drawer and patient pickers
//     subscribe to.

import { liveQuery } from 'dexie';
import { tables } from '../dexie';

function lc(s) { return (s ?? '').toString().toLowerCase(); }

export function fromServerDto(dto) {
  if (!dto || !dto.patientId) return null;
  const updatedAtIso = dto.updatedAt || null;
  return {
    ...dto,
    // Lowercase mirrors for indexed prefix search. The page UI still reads
    // the original-case fields; these are just for the where('_fooLower')
    // queries below.
    _fullNameLower:            lc(dto.fullName),
    _mobileLower:               lc(dto.mobile),
    _patientIdentifierLower:    lc(dto.patientIdentifier),
    _updatedAtMs: updatedAtIso ? new Date(updatedAtIso).getTime() : 0,
    _localDirty: 0,
  };
}

export async function applyServerDeltas(serverDtos) {
  const t = tables.patients();
  const tombstones = [];
  const live       = [];
  for (const dto of serverDtos || []) {
    if (dto.deletedAt) tombstones.push(dto.patientId);
    else {
      const row = fromServerDto(dto);
      if (row) live.push(row);
    }
  }
  if (tombstones.length) await t.bulkDelete(tombstones);
  if (live.length)       await t.bulkPut(live);
  return { applied: live.length, deleted: tombstones.length };
}

export async function highWatermarkIso() {
  const t = tables.patients();
  const max = await t.orderBy('_updatedAtMs').reverse().limit(1).first();
  if (!max || !max._updatedAtMs) return null;
  return new Date(max._updatedAtMs).toISOString();
}

// Reactive search. The booking drawer feeds keystrokes into this with a
// debounce and the result list re-renders whenever the sync engine writes
// new rows. Empty query returns the most-recently-registered N patients
// so the drawer's initial paint isn't a blank canvas.
export function watchPatients({ query = '', limit = 50 } = {}) {
  const q = lc(query).trim();
  return liveQuery(async () => {
    const t = tables.patients();
    let arr;
    if (!q) {
      // No search — show "recent" patients (by UpdatedAt desc) so the
      // common "open the drawer, no typing yet" case shows the rows the
      // front desk is most likely to revisit.
      arr = await t.orderBy('_updatedAtMs').reverse().limit(limit).toArray();
    } else {
      // Hit each indexed lowercase column with a prefix query and union.
      // We deliberately do startsWith rather than contains because Dexie
      // can serve prefix queries directly off the index; contains would
      // force a full-table scan which kills the offline-first promise
      // once the cache grows past a few thousand rows.
      const [byName, byMobile, byId] = await Promise.all([
        t.where('_fullNameLower').startsWith(q).limit(limit).toArray(),
        t.where('_mobileLower').startsWith(q).limit(limit).toArray(),
        t.where('_patientIdentifierLower').startsWith(q).limit(limit).toArray(),
      ]);
      // De-dupe by patientId — a single patient could match name and
      // identifier on the same query (e.g. typing the start of an MRN
      // that mirrors part of the name).
      const seen = new Set();
      arr = [];
      for (const r of [...byName, ...byMobile, ...byId]) {
        if (seen.has(r.patientId)) continue;
        seen.add(r.patientId);
        arr.push(r);
        if (arr.length >= limit) break;
      }
    }

    // Adapt the rows to the shape the existing page code expects
    // (id alias + name alias) so the booking drawer / patient picker
    // can swap straight from apiClient.get('/patients') without a
    // render-time rename.
    return arr.map((p) => ({
      ...p,
      id: p.patientId,
      name: p.fullName,
    }));
  });
}

export async function getPatientById(patientId) {
  if (!patientId) return null;
  return tables.patients().get(patientId);
}

// Duplicate-detection candidate net. Pulls a small, index-served set the
// fuzzy matcher can rank in JS, instead of scanning the whole cache:
//   • exact phone (the strong signal), and
//   • a short name-prefix (first ~3 chars of the first name token) so
//     spelling variants that agree on the opening letters — Mohammed /
//     Mohammad — are both captured, then separated by edit-distance.
// Returns rows in the page's { id, name, ... } shape.
export async function findDuplicateCandidates({ name = '', mobile = '', limit = 60 } = {}) {
  const t = tables.patients();
  const byId = new Map();
  const add = (rows) => { for (const r of rows) if (r && !byId.has(r.patientId)) byId.set(r.patientId, r); };

  const mob = lc(mobile).replace(/\D/g, '');
  if (mob.length >= 4) {
    add(await t.where('_mobileLower').equals(mob).limit(limit).toArray());
  }

  const norm = lc(name).replace(/[^a-z0-9\s]/g, ' ').trim();
  const firstTok = norm.split(/\s+/).filter(Boolean)[0] || '';
  if (firstTok.length >= 2) {
    const prefix = firstTok.slice(0, Math.min(3, firstTok.length));
    add(await t.where('_fullNameLower').startsWith(prefix).limit(limit).toArray());
  }

  return Array.from(byId.values()).map((p) => ({ ...p, id: p.patientId, name: p.fullName }));
}
