// CSV export helpers that are safe to open in Excel.
//
// The referral exports used to build CSV by string concatenation, which had three problems:
//   1. Patient / service names are typed by staff. A value starting with = + - or @ is run as a
//      FORMULA when the file is opened in Excel ("CSV injection"), so a hostile name could
//      execute =HYPERLINK(...) etc. csvCell() defuses those with a leading apostrophe.
//   2. Quotes inside a value were not escaped, breaking the row.
//   3. No UTF-8 byte-order mark, so Hindi / regional names opened as mojibake in Excel.

const FORMULA_START = /^[=+\-@\t\r]/;

/** One safely quoted CSV cell (text). */
export const csvCell = (value) => {
  let s = value == null ? '' : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/**
 * A phone number as text. A bare number is turned into a numeric cell by Excel (leading zeros
 * dropped, long values shown as 9.88E+09), so digit-only values are written as ="digits".
 * Only digits ever reach that branch, so it cannot carry a formula.
 */
export const csvPhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length > 0 && digits === String(value ?? '').trim() ? `="${digits}"` : csvCell(value);
};

/** A money / count column - always a plain number, never a string. */
export const csvNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Downloads `lines` (already-joined CSV rows, header first) as a UTF-8 file Excel opens correctly. */
export const downloadCsv = (filename, lines) => {
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the object URL once the download has spooled (avoids a leak).
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};
