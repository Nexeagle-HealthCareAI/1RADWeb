// Cheap "did this array actually change" check for liveQuery subscribers
// that want to skip a setState (and the re-render it triggers) when a
// Dexie liveQuery re-fires with equivalent data — e.g. some OTHER row
// changed and the query re-ran, but nothing this component cares about
// actually differs.
//
// `JSON.stringify(prev) === JSON.stringify(next)` does the same job but
// serializes every field of every row on both sides, every time — for a
// worklist of appointment objects that's real, repeated CPU cost on every
// sync tick. This instead concatenates just an id + a version stamp per
// row, which is enough to detect any add/remove/reorder/update.
export function fingerprintRows(rows, idKey = 'appointmentId', versionKey = '_updatedAtMs') {
  if (!rows || rows.length === 0) return '0';
  let fp = rows.length + ':';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    fp += r?.[idKey] + '.' + (r?.[versionKey] || 0) + '|';
  }
  return fp;
}
