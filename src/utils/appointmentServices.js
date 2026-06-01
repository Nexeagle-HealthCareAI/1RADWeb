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
 *     scanStartedAt, scanCompletedAt, reportedAt, deliveredAt, cancelledAt }
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
      reportedAt:       s.reportedAt ?? s.ReportedAt ?? null,
      deliveredAt:      s.deliveredAt ?? s.DeliveredAt ?? null,
      cancelledAt:      s.cancelledAt ?? s.CancelledAt ?? null,
      notes:            s.technicianComments ?? s.TechnicianComments ?? null,
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
    reportedAt:       appt.reportedAt ?? null,
    deliveredAt:      appt.deliveredAt ?? null,
    cancelledAt:      null,
    notes:            null,
  }];
}

// ─────────────────────────────────────────────────────────────────────────
//  Per-stage TAT helpers
// ─────────────────────────────────────────────────────────────────────────
// The worklist pill that says "Pending 25m" / "Awaiting report 1h 10m"
// reads from these. The clock starts the moment a line enters its
// current stage, which is *not* the same as the appointment booking
// time — a patient booked yesterday whose scan started this morning
// has only been "Scanned" for as long as the scan took.

/**
 * Returns the UTC instant the service line entered its current stage.
 * The fallbacks chain to the next-most-reliable signal so the clock
 * still says *something* even on rows from older deploys.
 *
 *   • NOT_STARTED → arrived-at, then booked-at — for the front-desk
 *                   "waiting at reception" timer.
 *   • SCANNED     → scanCompletedAt — "waiting for the doctor".
 *   • REPORTED    → reportedAt, then scanCompletedAt — "waiting for
 *                   the patient to pick up".
 *   • DELIVERED   → deliveredAt — for completeness; usually no badge.
 *   • CANCELLED   → cancelledAt; null badge.
 */
export function getStageStartedAt(line, appt) {
  const status = (line?.status || 'NOT_STARTED').toUpperCase();
  switch (status) {
    case 'IN_PROGRESS':
    case 'IN_MID':      return line.scanStartedAt   || appt?.arrivedAt || null;
    case 'SCANNED':     return line.scanCompletedAt || line.scanStartedAt || null;
    case 'REPORTED':    return line.reportedAt      || line.scanCompletedAt || null;
    case 'DELIVERED':   return line.deliveredAt     || null;
    case 'CANCELLED':   return line.cancelledAt     || null;
    case 'NOT_STARTED':
    default:
      // Only count from arrival. appt.dateTime is the *scheduled* slot
      // and is a local-time string, not a UTC stamp — using it would
      // either lie ("waiting 8h" for a slot booked tomorrow morning)
      // or trip the UTC parser. If the patient hasn't checked in yet,
      // we have nothing to count, so return null and the chip hides.
      return appt?.arrivedAt || null;
  }
}

/**
 * Parse a server timestamp as UTC.
 *
 * The .NET API stamps every TAT milestone with DateTime.UtcNow, but
 * default System.Text.Json serialisation emits "2026-06-01T03:25:00"
 * with no "Z" suffix or offset. The browser's Date constructor then
 * treats that as *local* time — so on an IST client the timestamp
 * gets bumped 5h 30m into the future and elapsed time shows
 * "5h 30m too much". We fix it here rather than in every caller.
 *
 * If the string already carries a Z/±HH:MM offset, leave it alone.
 */
function parseUtc(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const s = String(value);
  const hasTz = /[zZ]$|[+\-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(hasTz ? s : `${s}Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Whole-minute elapsed time since the stage started. Returns null when
 * we have no anchor (e.g. NOT_STARTED on a future booking with no
 * arrival yet) so callers can skip the chip cleanly.
 */
export function getStageElapsedMinutes(line, appt, nowMs = Date.now()) {
  const startedAt = getStageStartedAt(line, appt);
  if (!startedAt) return null;
  const startedDate = parseUtc(startedAt);
  if (!startedDate) return null;
  // Clamp negatives to 0 — a clock-skewed client shouldn't see "-2 min".
  return Math.max(0, Math.floor((nowMs - startedDate.getTime()) / 60000));
}

/**
 * Human "1h 20m" / "5m" / "3d" — short labels for the chip.
 * Designed to fit in ~50px with no wrapping.
 */
export function formatStageElapsed(minutes) {
  if (minutes == null) return '';
  if (minutes < 1)         return 'just now';
  if (minutes < 60)        return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem   = minutes % 60;
  if (hours < 24)          return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
  const days = Math.floor(hours / 24);
  const hRem = hours % 24;
  if (days < 7)            return hRem === 0 ? `${days}d` : `${days}d ${hRem}h`;
  return `${days}d`;
}

// Per-stage SLA thresholds in minutes. Tuned for a typical radiology
// centre — generous enough that a normal flow stays green, tight
// enough that something stuck stands out. Moving these to a per-
// hospital config table is a future enhancement.
const STAGE_SLA_MIN = {
  NOT_STARTED: { warn: 30,  breach: 60  },  // waiting for the scan
  IN_PROGRESS: { warn: 15,  breach: 45  },  // scan in progress (in the room)
  IN_MID:      { warn: 10,  breach: 30  },  // half-way through the scan
  SCANNED:     { warn: 60,  breach: 240 },  // waiting for the report
  REPORTED:    { warn: 30,  breach: 90  },  // waiting for hand-over
  DELIVERED:   { warn: null, breach: null },
  CANCELLED:   { warn: null, breach: null },
};

/**
 * Bucket the elapsed time against the stage's SLA. Returns:
 *   'ok'     — under the warn threshold (or no threshold defined)
 *   'warn'   — past warn, under breach
 *   'breach' — past breach
 *
 * Null elapsed → 'ok' (we don't have enough data to flag).
 */
export function getStageSlaBucket(line, minutes) {
  const status = (line?.status || 'NOT_STARTED').toUpperCase();
  const sla    = STAGE_SLA_MIN[status];
  if (!sla || minutes == null) return 'ok';
  if (sla.breach != null && minutes >= sla.breach) return 'breach';
  if (sla.warn   != null && minutes >= sla.warn)   return 'warn';
  return 'ok';
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
