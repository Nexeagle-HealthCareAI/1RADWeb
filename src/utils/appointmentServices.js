// Helpers for the multi-service appointment rollout.
//
// A single Appointment now carries a list of AppointmentService line
// items (services[]). Every consumer of an appointment row that used to
// peek at appt.modality / appt.service should go through these helpers
// so the same row works whether it came from:
//
//   • the new server build       (services populated, plus the scalar
//                                 fields mirroring the primary line)
//   • the old server build       (services undefined, only scalars)
//   • an old Dexie cache         (services undefined on rows pulled
//                                 before the upgrade)
//
// In every case the helpers return a one-or-many list with at least one
// entry, so worklist rendering, filters and aggregates can be written
// without branching on cache state.

const MODALITY_FALLBACK = 'OT';

// Normalise a freeform modality string for comparison ('X-Ray  ' -> 'X-RAY').
function norm(v) {
  return (v == null ? '' : String(v)).trim().toUpperCase();
}

/**
 * Return the appointment's service lines as a non-empty array.
 *
 * Each line has the same shape regardless of source:
 *   { id, serviceName, modality, status, amount, referralCutValue,
 *     scanStartedAt, scanCompletedAt, deliveredAt }
 *
 * When the appointment came from a v1 source (no services array) we
 * synthesise a single line from the scalar fields so renderers can
 * treat one-and-many uniformly.
 */
export function getServiceLines(appt) {
  if (!appt) return [];
  const arr = Array.isArray(appt.services) ? appt.services : null;
  if (arr && arr.length > 0) {
    return arr.map(s => ({
      id:               s.id ?? null,
      serviceName:      s.serviceName ?? s.ServiceName ?? '',
      modality:         norm(s.modality ?? s.Modality) || MODALITY_FALLBACK,
      status:           (s.status ?? s.Status ?? 'NOT_STARTED').toUpperCase(),
      amount:           Number(s.amount ?? s.Amount ?? 0),
      referralCutValue: Number(s.referralCutValue ?? s.ReferralCutValue ?? 0),
      scanStartedAt:    s.scanStartedAt ?? s.ScanStartedAt ?? null,
      scanCompletedAt:  s.scanCompletedAt ?? s.ScanCompletedAt ?? null,
      deliveredAt:      s.deliveredAt ?? s.DeliveredAt ?? null,
    }));
  }

  // v1 fallback — one line from the scalar fields. Status is mapped from
  // the parent's report-progress so the aggregate pill still works.
  const status = mapReportProgressToServiceStatus(appt.reportProgressStatus);
  return [{
    id:               null,
    serviceName:      appt.service || '',
    modality:         norm(appt.modality) || MODALITY_FALLBACK,
    status,
    amount:           Number(appt.amount || 0),
    referralCutValue: Number(appt.referralCutValue || 0),
    scanStartedAt:    appt.scanStartedAt ?? null,
    scanCompletedAt:  appt.scannedAt ?? null,
    deliveredAt:      appt.deliveredAt ?? null,
  }];
}

function mapReportProgressToServiceStatus(rp) {
  switch ((rp || '').toUpperCase()) {
    case 'DELIVERED':   return 'DELIVERED';
    case 'COMPLETED':   return 'REPORTED';
    case 'IN_PROGRESS': return 'SCANNED';
    default:            return 'NOT_STARTED';
  }
}

/**
 * Unique modality codes on the visit, preserving first-seen order so
 * the chip stack is stable across renders. Always returns at least one
 * entry (even if it's the fallback 'OT').
 */
export function getUniqueModalities(appt) {
  const seen = new Set();
  const out  = [];
  for (const line of getServiceLines(appt)) {
    const m = line.modality;
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out.length > 0 ? out : [MODALITY_FALLBACK];
}

/**
 * Does ANY service on the visit match the given modality? Used by the
 * worklist filter so picking "CT" surfaces a visit that has CT + X-ray.
 * Case-insensitive; null/blank target means "match everything".
 */
export function matchesAnyModality(appt, target) {
  if (!target || target === 'ALL') return true;
  const want = norm(target);
  if (!want) return true;
  return getServiceLines(appt).some(line => line.modality === want);
}

/**
 * Aggregate "where is this visit in its reporting flow" tally.
 *
 *   total        — total live services
 *   reported     — services that have a final report
 *   delivered    — services whose report has been delivered to the patient
 *   notStarted   — not scanned yet
 *
 * For single-service visits the values are 1/0/1 etc. and renderers
 * typically skip the "X of Y" badge altogether; for multi-service
 * visits the badge says e.g. "2 of 3 reported".
 */
export function getReportProgressSummary(appt) {
  const lines = getServiceLines(appt);
  let reported = 0, delivered = 0, scanned = 0, notStarted = 0;
  for (const l of lines) {
    if (l.status === 'DELIVERED')   { delivered++; reported++; continue; }
    if (l.status === 'REPORTED')    { reported++;             continue; }
    if (l.status === 'SCANNED')     { scanned++;              continue; }
    notStarted++;
  }
  return { total: lines.length, reported, delivered, scanned, notStarted };
}

/**
 * Worklist-row friendly "X / Y" string ("2 / 3 reported"). Returns null
 * for single-service visits so callers can skip the chip entirely.
 */
export function getReportProgressLabel(appt) {
  const s = getReportProgressSummary(appt);
  if (s.total <= 1) return null;
  return `${s.reported} / ${s.total} reported`;
}
