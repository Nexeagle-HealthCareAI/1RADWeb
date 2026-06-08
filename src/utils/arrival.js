// Single source of truth for "has the patient arrived?" — used to gate work
// across the Doctor / Operations / Technician boards (disable the work action
// + show a "not arrived" note) and to withhold the queue token on the slip
// until arrival.
//
// A visit counts as arrived when it has an `arrivedAt` stamp OR its status has
// already moved past the pre-arrival states (scheduled / booked / future). The
// status fallback covers older rows that progressed before arrivedAt existed.
const PRE_ARRIVAL_STATUSES = ['scheduled', 'booked', 'future', ''];

export function isPatientArrived(appt) {
  if (!appt) return false;
  if (appt.arrivedAt) return true;
  const status = String(appt.status || '').toLowerCase();
  return !PRE_ARRIVAL_STATUSES.includes(status);
}
