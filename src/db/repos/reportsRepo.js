// Cached DiagnosticReports — read/write.
//
// Three callers:
//   1. SyncEngine.pullReports → bulk delta-apply (server is source of truth)
//   2. ReportingPage initial load → if offline, render from cache
//   3. ReportingPage autosave → write the in-flight draft to local storage
//      so a tab close / browser crash doesn't lose work
//
// Layout: the primary key (the `appointmentId` field, for schema reasons) is
// the REPORT key — "<visitId>|<studyId>" for a study on a multi-study visit,
// or just "<visitId>" for a visit-level (legacy / single-study) report.
// Keying by visit alone made every study on a visit share one cached row, so
// offline, one study could show (and re-save) another study's text.
// `visitId` and `appointmentServiceId` hold the real ids.

import { liveQuery } from 'dexie';
import { tables } from '../dexie';

export const reportKey = (visitId, serviceId) => (serviceId ? `${visitId}|${serviceId}` : visitId);

export function fromServerDto(dto) {
  if (!dto || !dto.appointmentId) return null;
  const updatedAtIso = dto.updatedAt || null;
  const serviceId = dto.appointmentServiceId ?? null;
  return {
    appointmentId: reportKey(dto.appointmentId, serviceId),
    visitId:       dto.appointmentId,
    appointmentServiceId: serviceId,
    status:        dto.status ?? null,
    id:             dto.id ?? null,
    doctorId:       dto.doctorId ?? null,
    templateId:     dto.templateId ?? null,
    findings:       dto.findings ?? '',
    impression:     dto.impression ?? '',
    advice:         dto.advice ?? '',
    isFinalized:    !!dto.isFinalized ? 1 : 0,
    finalizedAt:    dto.finalizedAt ?? null,
    createdAt:      dto.createdAt ?? null,
    updatedAt:      updatedAtIso,
    reportingMode:  dto.reportingMode ?? 'Narrative',
    // B2 Track 3 — OCC token. Server sends as base64 string; we keep it
    // verbatim and echo back on save so a concurrent edit is detected.
    rowVersion:     dto.rowVersion ?? null,
    _updatedAtMs:   updatedAtIso ? new Date(updatedAtIso).getTime() : 0,
    // The server's own time for this row. _updatedAtMs moves to "now" when a
    // local draft is written; the pull watermark must not, or other people's
    // changes made in between would never be pulled.
    _serverMs:      updatedAtIso ? new Date(updatedAtIso).getTime() : 0,
    _localDirty:    0,
  };
}

export async function applyServerDeltas(serverDtos) {
  const t = tables.reports();
  const tombstones = [];
  const live       = [];
  for (const dto of serverDtos || []) {
    if (dto.deletedAt) tombstones.push(reportKey(dto.appointmentId, dto.appointmentServiceId));
    else {
      const row = fromServerDto(dto);
      if (row) live.push(row);
    }
  }
  if (tombstones.length) await t.bulkDelete(tombstones);
  if (live.length) {
    // Conflict policy: server overwrites local UNLESS the local row is
    // marked dirty (an unsynced draft). A dirty local draft must win so we
    // don't trample work the radiologist hasn't pushed yet. The outbox
    // pushes the draft → backend save → next pull brings down the canonical
    // version → local row is no longer dirty → next delta can overwrite.
    for (const row of live) {
      const existing = await t.get(row.appointmentId);
      if (existing?._localDirty) continue;
      await t.put(row);
    }
  }
  return { applied: live.length, deleted: tombstones.length };
}

export async function highWatermarkIso() {
  const t = tables.reports();
  let maxMs = 0;
  await t.each((r) => {
    const ms = r._serverMs ?? (r._localDirty ? 0 : r._updatedAtMs) ?? 0;
    if (ms > maxMs) maxMs = ms;
  });
  if (!maxMs) return null;
  // +1ms past the last-seen row — the server's sub-ms UpdatedAt is always > our
  // ms-truncated value, which otherwise re-pulls the boundary rows every cycle.
  return new Date(maxMs + 1).toISOString();
}

// One-shot read for the ReportingPage initial paint. With a study id, only
// THAT study's row counts — never another study's row on the same visit.
export async function getReportByAppointmentId(appointmentId, serviceId = null) {
  if (!appointmentId) return null;
  const t = tables.reports();
  if (!serviceId) return t.get(appointmentId);
  const exact = await t.get(reportKey(appointmentId, serviceId));
  if (exact) return exact;
  // A visit-level row is only usable when it is known to be this study's.
  const visitRow = await t.get(appointmentId);
  return visitRow && visitRow.appointmentServiceId === serviceId ? visitRow : null;
}

// Reactive read — the editor doesn't currently subscribe, but other
// surfaces (worklist row decorator, "report ready" indicator) can use
// this to render a badge that updates as soon as the SyncEngine writes
// a freshly-finalised report into the cache.
export function watchReport(appointmentId) {
  return liveQuery(() => tables.reports().get(appointmentId));
}

// Local autosave write. Marks the row dirty so the next sync delta does
// NOT overwrite the user's unsynced draft. The outbox is the thing that
// eventually pushes this to the server; clearing _localDirty is the
// SyncEngine's job after it sees the row come back from the server.
export async function saveLocalDraft(appointmentId, draft, serviceId = null) {
  if (!appointmentId) return;
  const t = tables.reports();
  const nowMs = Date.now();
  const key = reportKey(appointmentId, serviceId);
  const existing = await t.get(key);
  await t.put({
    ...(existing || {}),
    appointmentId: key,
    visitId: appointmentId,
    appointmentServiceId: serviceId || null,
    findings:    draft.findings   ?? existing?.findings   ?? '',
    impression:  draft.impression ?? existing?.impression ?? '',
    advice:      draft.advice     ?? existing?.advice     ?? '',
    templateId:  draft.templateId ?? existing?.templateId ?? null,
    // Always keep an existing isFinalized true — drafts can't unfinalize.
    isFinalized: existing?.isFinalized ? 1 : (draft.isFinalized ? 1 : 0),
    updatedAt:   new Date(nowMs).toISOString(),
    _updatedAtMs: nowMs,
    _localDirty: 1,
  });
}

// Eviction — drop cached reports whose last-update is older than the
// cut-off, but NEVER drop a row that's locally dirty (_localDirty=1
// means there's an unsynced draft we'd otherwise lose). The quota
// monitor calls this from Track 4 when storage fills up. Re-fetched on
// demand the next time the user opens that report online.
export async function evictOlderThan(daysAgo) {
  if (!Number.isFinite(daysAgo) || daysAgo <= 0) return 0;
  const cutoffMs = Date.now() - daysAgo * 24 * 3600 * 1000;
  const t = tables.reports();
  return t
    .filter(r => !r._localDirty && (r._updatedAtMs || 0) < cutoffMs)
    .delete();
}

// Called by the SyncEngine immediately after a successful push of the
// outboxed draft so the next delta pull is allowed to overwrite this row
// with the canonical server copy.
export async function clearLocalDirty(appointmentId, serviceId = null) {
  if (!appointmentId) return;
  const t = tables.reports();
  const row = await t.get(reportKey(appointmentId, serviceId));
  if (!row) return;
  await t.put({ ...row, _localDirty: 0 });
}
