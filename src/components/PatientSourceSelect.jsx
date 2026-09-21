import React, { useState } from 'react';
import { PATIENT_SOURCES, OTHER_SOURCE, canonicalSource } from '../utils/patientSources';

const FIELD_STYLE = {
  width: '100%', fontSize: '13px', padding: '8px 10px', height: '38px', boxSizing: 'border-box',
  border: '1.5px solid #0f52ba20', background: '#f0f7ff', borderRadius: '10px', outline: 'none',
  fontWeight: 600, color: '#1e293b',
};

/**
 * "How did you hear about us" - one dropdown of channels (see utils/patientSources.js), used by
 * every patient / appointment form so the answers can be totalled.
 *
 * Picking "Other" reveals a small box for the detail; that text is what gets saved (the API keeps
 * it as typed and reports it under "Other"). A value typed before the dropdown existed and not on
 * the list (legacy free text) shows as "Other" with its text intact, so opening and saving an old
 * record never silently changes it.
 *
 * `variant`: 'android' (mobile sheet, android-* classes) or 'field' (desktop drawers).
 */
export default function PatientSourceSelect({ value, onChange, variant = 'field', disabled = false }) {
  const current = value || '';
  const known = canonicalSource(current);
  const [otherMode, setOtherMode] = useState(!!current && !known);

  // A parent that resets the form (value -> '') collapses the detail box. (State is adjusted while
  // rendering, the documented alternative to a setState-in-effect.)
  const [prevCurrent, setPrevCurrent] = useState(current);
  if (current !== prevCurrent) {
    setPrevCurrent(current);
    if (!current) setOtherMode(false);
  }

  const selectValue = otherMode ? OTHER_SOURCE : (known || '');
  const showDetail = otherMode;
  const detail = current === OTHER_SOURCE ? '' : current;

  const onSelect = (e) => {
    const picked = e.target.value;
    if (picked === OTHER_SOURCE) {
      setOtherMode(true);
      // Keep legacy free text if that is what is there; otherwise just "Other".
      onChange(current && !known ? current : OTHER_SOURCE);
    } else {
      setOtherMode(false);
      onChange(picked);
    }
  };

  const android = variant === 'android';
  const selectProps = android
    ? { className: 'android-input', style: { background: '#f8fafc' } }
    : { style: FIELD_STYLE };
  const detailProps = android
    ? { className: 'android-input', style: { marginTop: '8px', background: '#f8fafc' } }
    : { style: { ...FIELD_STYLE, marginTop: '6px' } };

  return (
    <>
      <select {...selectProps} value={selectValue} onChange={onSelect} disabled={disabled} aria-label="How did the patient hear about us">
        <option value="">Select…</option>
        {PATIENT_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {showDetail && (
        <input
          type="text"
          {...detailProps}
          placeholder="Please specify (optional)"
          value={detail}
          disabled={disabled}
          onChange={e => onChange(e.target.value.trim() ? e.target.value : OTHER_SOURCE)}
        />
      )}
    </>
  );
}
