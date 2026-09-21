// "How did the patient hear about us" - the list of channels.
//
// It used to be a free-text box plus six quick-chips copied into five forms, so the same channel
// was typed as "Camp", "camp", "Health camp", "CAMPS" and no report could total it. The forms now
// share one dropdown built from this list. The API (PatientSources.cs) keeps the same list, stores
// these spellings for any casing/spacing, keeps anything else as typed, and reports loose wording
// under the nearest channel - so an older build or an import that still sends free text is fine.
//
// The first six are the labels the old chips wrote, so existing rows are already canonical.
export const OTHER_SOURCE = 'Other';

export const PATIENT_SOURCES = [
  'Friend / Family',
  'By Doctor',
  'Camp',
  'Social Media',
  'Previous Patient',
  'Walk-in',
  'Newspaper / Hoarding',
  'Online / Google',
  OTHER_SOURCE,
];

const key = (s) => String(s ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();

/** The canonical channel a stored value is (any casing / spacing), or null when it is blank or free text. */
export const canonicalSource = (value) => {
  const k = key(value);
  return k ? (PATIENT_SOURCES.find(s => key(s) === k) ?? null) : null;
};
