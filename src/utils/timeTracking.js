// Turnaround-time helpers used by every operations board to render
// "on-premises" and "scan → delivery" intervals.
//
// All inputs are ISO strings from the API (UTC); the helpers do the diff in
// pure JS so they don't need a timezone. Display rendering still goes through
// the standard `Asia/Kolkata` formatters elsewhere.
//
// The "active" intervals (ArrivedAt present, DeliveredAt missing) tick once a
// minute via useTickClock so the UI always shows the live elapsed time
// without re-fetching from the server.

export const OVERDUE_THRESHOLD_MIN = 180; // matches Worklist:OverdueThresholdMinutes (3h)

// EF Core / System.Text.Json drops the trailing 'Z' on DateTime columns whose
// Kind is Unspecified (the default when loaded from SQL Server). Without the
// Z, `new Date()` parses the string as LOCAL time — so a timestamp written
// from .NET as DateTime.UtcNow gets misread as Asia/Kolkata time, inflating
// the elapsed minutes by exactly the IST offset (5h 30m).
//
// The backend writes UTC unconditionally, so we can safely treat any ISO
// string without a timezone designator as UTC. This guard fixes the on-
// premises clock without needing a backend migration.
function parseUtc(iso) {
  if (!iso) return NaN;
  // Already has Z or ±HH:MM offset → trust as-is.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) return new Date(iso).getTime();
  // No timezone marker → append Z so the browser parses as UTC.
  return new Date(iso + 'Z').getTime();
}

export function elapsedMinutes(startIso, endIso) {
  if (!startIso) return null;
  const start = parseUtc(startIso);
  if (Number.isNaN(start)) return null;
  const end = endIso ? parseUtc(endIso) : Date.now();
  if (Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}

export function formatElapsed(startIso, endIso) {
  const m = elapsedMinutes(startIso, endIso);
  if (m == null) return '—';
  if (m < 1) return '<1m';
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// Classifies the on-premises clock into a visual severity bucket. The
// thresholds were chosen so a normal X-ray flow (arrived → scanned → reported
// → delivered ≈ 45 min) renders neutral; queues stretching past 1h tint amber;
// past 3h pulse red (and surface in the overdue endpoint server-side).
//
// Returns: 'idle' | 'fresh' | 'warning' | 'critical' | 'overdue'
//   idle      — no arrival yet
//   fresh     — < 60 min on premises
//   warning   — 60–120 min
//   critical  — 120–180 min
//   overdue   — ≥ 180 min  (pulses red, drives notification bell)
export function premisesSeverity(arrivedAt, deliveredAt) {
  if (!arrivedAt) return 'idle';
  if (deliveredAt) return 'fresh'; // delivered patients are not on-premises
  const m = elapsedMinutes(arrivedAt);
  if (m == null) return 'idle';
  if (m >= OVERDUE_THRESHOLD_MIN) return 'overdue';
  if (m >= 120) return 'critical';
  if (m >= 60) return 'warning';
  return 'fresh';
}

// Inline-style swatch for the on-premises pill. Kept here so every board
// renders the same palette without duplicating ternaries.
export function premisesPillStyle(severity) {
  switch (severity) {
    case 'overdue':  return { color: '#dc2626', bg: '#fee2e2', border: '#fecaca' };
    case 'critical': return { color: '#b45309', bg: '#fef3c7', border: '#fde68a' };
    case 'warning':  return { color: '#a16207', bg: '#fef9c3', border: '#fde047' };
    case 'fresh':    return { color: '#0f766e', bg: '#ccfbf1', border: '#99f6e4' };
    default:         return { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
  }
}
